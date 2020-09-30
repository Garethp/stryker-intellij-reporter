"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.strykerPlugins = void 0;
const plugin_1 = require("@stryker-mutator/api/plugin");
const report_1 = require("@stryker-mutator/api/report");
const ProgressBar = require("progress");
const plugin_2 = require("@stryker-mutator/api/plugin");
const ClearTextScoreTable_1 = require("@stryker-mutator/core/src/reporters/ClearTextScoreTable");
const chalk = require("chalk");
const mutation_testing_metrics_1 = require("mutation-testing-metrics");
const typed_inject_1 = require("typed-inject");
class Timer {
    constructor(now = () => new Date()) {
        this.now = now;
        this.reset();
    }
    reset() {
        this.markers = Object.create(null);
        this.start = this.now();
    }
    humanReadableElapsed() {
        const elapsedSeconds = this.elapsedSeconds();
        return (Timer.humanReadableElapsedMinutes(elapsedSeconds) +
            Timer.humanReadableElapsedSeconds(elapsedSeconds));
    }
    elapsedSeconds() {
        const elapsedMs = this.elapsedMs();
        return Math.floor(elapsedMs / 1000);
    }
    elapsedMs(sinceMarker) {
        if (sinceMarker && this.markers[sinceMarker]) {
            return this.now().getTime() - this.markers[sinceMarker].getTime();
        }
        else {
            return this.now().getTime() - this.start.getTime();
        }
    }
    mark(name) {
        this.markers[name] = this.now();
    }
    static humanReadableElapsedSeconds(elapsedSeconds) {
        const restSeconds = elapsedSeconds % 60;
        if (restSeconds === 1) {
            return `${restSeconds} second`;
        }
        else {
            return `${restSeconds} seconds`;
        }
    }
    static humanReadableElapsedMinutes(elapsedSeconds) {
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        if (elapsedMinutes > 1) {
            return `${elapsedMinutes} minutes `;
        }
        else if (elapsedMinutes > 0) {
            return `${elapsedMinutes} minute `;
        }
        else {
            return "";
        }
    }
}
class ProgressKeeper {
    constructor() {
        this.progress = {
            survived: 0,
            timedOut: 0,
            tested: 0,
            total: 0,
        };
    }
    onAllMutantsMatchedWithTests(matchedMutants) {
        this.timer = new Timer();
        this.mutantIdsWithoutCoverage = matchedMutants
            .filter((m) => { var _a; return !m.runAllTests && !((_a = (m.testFilter || m.scopedTestIds)) === null || _a === void 0 ? void 0 : _a.length); })
            .map((m) => m.id);
        this.progress.total =
            matchedMutants.length - this.mutantIdsWithoutCoverage.length;
    }
    onMutantTested(result) {
        if (!this.mutantIdsWithoutCoverage.some((id) => result.id === id)) {
            this.progress.tested++;
        }
        if (result.status === report_1.MutantStatus.Survived) {
            this.progress.survived++;
        }
        if (result.status === report_1.MutantStatus.TimedOut) {
            this.progress.timedOut++;
        }
    }
    getElapsedTime() {
        return this.formatTime(this.timer.elapsedSeconds());
    }
    getEtc() {
        const totalSecondsLeft = Math.floor((this.timer.elapsedSeconds() / this.progress.tested) *
            (this.progress.total - this.progress.tested));
        if (isFinite(totalSecondsLeft) && totalSecondsLeft > 0) {
            return this.formatTime(totalSecondsLeft);
        }
        else {
            return "n/a";
        }
    }
    formatTime(timeInSeconds) {
        const hours = Math.floor(timeInSeconds / 3600);
        const minutes = Math.floor((timeInSeconds % 3600) / 60);
        return hours > 0
            ? `~${hours}h ${minutes}m`
            : minutes > 0
                ? `~${minutes}m`
                : "<1m";
    }
}
class ProgressBarReporter extends ProgressKeeper {
    constructor(log, options) {
        super();
        this.log = log;
        this.options = options;
        this.out = process.stdout;
        this.files = [];
        this.failedMessages = {};
        this.workingDirectory = `${process.cwd()}/`;
    }
    makeRelative(fileName) {
        if (fileName.indexOf(this.workingDirectory) === 0) {
            return fileName.replace(this.workingDirectory, "");
        }
        return fileName;
    }
    onAllMutantsMatchedWithTests(matchedMutants) {
        super.onAllMutantsMatchedWithTests(matchedMutants);
        const progressBarContent = "Mutation testing  [:bar] :percent (elapsed: :et, remaining: :etc) :tested/:total tested (:survived survived, :timedOut timed out)";
        this.files = matchedMutants.reduce((results, mutant) => {
            if (results.indexOf(mutant.fileName) != -1) {
                return results;
            }
            return [...results, mutant.fileName];
        }, []);
        for (const mutant of this.files) {
            this.out.write(`##teamcity[testStarted parentNodeId='0' nodeId='${mutant}' name='${this.makeRelative(mutant)}' running='true']\r\n`);
        }
        this.out.write(`##teamcity[testCount count='${this.progress.total}']`);
        this.progressBar = new ProgressBar(progressBarContent, {
            complete: "=",
            incomplete: " ",
            stream: process.stdout,
            total: this.progress.total,
            width: 50,
        });
    }
    getSourceFile(mutant) {
        return mutant.sourceFilePath || mutant.fileName;
    }
    onMutantTested(result) {
        const startLocation = `${result.location.start.line + 1}:${result.location.start.column + 1}`;
        const endLocation = `${result.location.end.line + 1}:${result.location.end.column + 1}`;
        const locationHint = `locationHint='stryker-mutant://${this.makeRelative(this.getSourceFile(result))}::${startLocation}::${endLocation}'`;
        const parentNode = `parentNodeId='${this.getSourceFile(result)}'`;
        const name = `name='${this.makeRelative(this.getSourceFile(result))}'`;
        const nodeId = `nodeId='${this.getSourceFile(result)}:${result.id}'`;
        const nodeType = `nodeType='test'`;
        const compare = `expected='${this.escape(result.originalLines)}' actual='${this.escape(result.mutatedLines)}'`;
        this.out.write(`##teamcity[testStarted ${parentNode} ${nodeId} ${name} ${locationHint} ${nodeType} running='true']\r\n`);
        if (result.status === report_1.MutantStatus.Survived) {
            let message = `${chalk.cyan(this.getSourceFile(result))}:${chalk.yellow(result.location.start.line + 1)}:${chalk.yellow(result.location.start.column + 1)}` + "\n";
            message += chalk.red(`- ${result.originalLines}`) + "\n";
            message += chalk.green(`+ ${result.mutatedLines}`);
            message = this.escape(message);
            this.out.write(`##teamcity[testFailed message='${message}' ${parentNode} ${locationHint} ${nodeId} ${name} ${nodeType}]\r\n`);
            this.failedMessages[this.getSourceFile(result)] =
                this.failedMessages[this.getSourceFile(result)] || [];
            this.failedMessages[this.getSourceFile(result)].push(message);
        }
        else
            this.out.write(`##teamcity[testFinished ${parentNode} ${locationHint} ${nodeId} ${name} ${nodeType}]\r\n`);
        super.onMutantTested(result);
    }
    escape(message) {
        return message
            .replace(/\|/g, "||")
            .replace(/\r/g, "|r")
            .replace(/\n/g, "|n")
            .replace(/\\/g, "|")
            .replace(/\[/g, "|[")
            .replace(/]/g, "|]")
            .replace(/'/g, "|'");
    }
    onAllMutantsTested(results) {
        for (const mutant of this.files) {
            if (this.failedMessages[mutant]) {
                this.out.write(`##teamcity[testFailed parentNodeId='0' nodeId='${mutant}' name='${this.makeRelative(mutant)}' message='']\r\n`);
            }
            else
                this.out.write(`##teamcity[testFinished parentNodeId='0' nodeId='${mutant}' name='${this.makeRelative(mutant)}']\r\n`);
        }
    }
    onMutationTestReportReady(report) {
        const metricsResult = mutation_testing_metrics_1.calculateMetrics(report.files);
        this.out.write("\r\n");
        this.out.write(new ClearTextScoreTable_1.default(metricsResult, this.options.thresholds).draw());
        this.out.write("\r\n\r\n");
    }
    tick(tickObj) {
        this.progressBar.tick(tickObj);
    }
    render(renderObj) {
        this.progressBar.render(renderObj);
    }
}
exports.default = ProgressBarReporter;
ProgressBarReporter.inject = typed_inject_1.tokens(plugin_1.commonTokens.logger, plugin_1.commonTokens.options);
exports.strykerPlugins = [
    plugin_2.declareClassPlugin(plugin_2.PluginKind.Reporter, "intellij", ProgressBarReporter),
];
//# sourceMappingURL=Progress.js.map