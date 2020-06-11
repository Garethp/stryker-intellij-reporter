"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
exports.strykerPlugins = void 0;
var plugin_1 = require("@stryker-mutator/api/plugin");
var report_1 = require("@stryker-mutator/api/report");
var ProgressBar = require("progress");
var plugin_2 = require("@stryker-mutator/api/plugin");
var ClearTextScoreTable_1 = require("@stryker-mutator/core/src/reporters/ClearTextScoreTable");
var chalk = require("chalk");
var mutation_testing_metrics_1 = require("mutation-testing-metrics");
var typed_inject_1 = require("typed-inject");
var Timer = /** @class */ (function () {
    function Timer(now) {
        if (now === void 0) { now = function () { return new Date(); }; }
        this.now = now;
        this.reset();
    }
    Timer.prototype.reset = function () {
        this.markers = Object.create(null);
        this.start = this.now();
    };
    Timer.prototype.humanReadableElapsed = function () {
        var elapsedSeconds = this.elapsedSeconds();
        return Timer.humanReadableElapsedMinutes(elapsedSeconds) + Timer.humanReadableElapsedSeconds(elapsedSeconds);
    };
    Timer.prototype.elapsedSeconds = function () {
        var elapsedMs = this.elapsedMs();
        return Math.floor(elapsedMs / 1000);
    };
    Timer.prototype.elapsedMs = function (sinceMarker) {
        if (sinceMarker && this.markers[sinceMarker]) {
            return this.now().getTime() - this.markers[sinceMarker].getTime();
        }
        else {
            return this.now().getTime() - this.start.getTime();
        }
    };
    Timer.prototype.mark = function (name) {
        this.markers[name] = this.now();
    };
    Timer.humanReadableElapsedSeconds = function (elapsedSeconds) {
        var restSeconds = elapsedSeconds % 60;
        if (restSeconds === 1) {
            return restSeconds + " second";
        }
        else {
            return restSeconds + " seconds";
        }
    };
    Timer.humanReadableElapsedMinutes = function (elapsedSeconds) {
        var elapsedMinutes = Math.floor(elapsedSeconds / 60);
        if (elapsedMinutes > 1) {
            return elapsedMinutes + " minutes ";
        }
        else if (elapsedMinutes > 0) {
            return elapsedMinutes + " minute ";
        }
        else {
            return '';
        }
    };
    return Timer;
}());
var ProgressKeeper = /** @class */ (function () {
    function ProgressKeeper() {
        this.progress = {
            survived: 0,
            timedOut: 0,
            tested: 0,
            total: 0
        };
    }
    ProgressKeeper.prototype.onAllMutantsMatchedWithTests = function (matchedMutants) {
        this.timer = new Timer();
        this.mutantIdsWithoutCoverage = matchedMutants.filter(function (m) { return !m.runAllTests && m.scopedTestIds.length === 0; }).map(function (m) { return m.id; });
        this.progress.total = matchedMutants.length - this.mutantIdsWithoutCoverage.length;
    };
    ProgressKeeper.prototype.onMutantTested = function (result) {
        if (!this.mutantIdsWithoutCoverage.some(function (id) { return result.id === id; })) {
            this.progress.tested++;
        }
        if (result.status === report_1.MutantStatus.Survived) {
            this.progress.survived++;
        }
        if (result.status === report_1.MutantStatus.TimedOut) {
            this.progress.timedOut++;
        }
    };
    ProgressKeeper.prototype.getElapsedTime = function () {
        return this.formatTime(this.timer.elapsedSeconds());
    };
    ProgressKeeper.prototype.getEtc = function () {
        var totalSecondsLeft = Math.floor((this.timer.elapsedSeconds() / this.progress.tested) * (this.progress.total - this.progress.tested));
        if (isFinite(totalSecondsLeft) && totalSecondsLeft > 0) {
            return this.formatTime(totalSecondsLeft);
        }
        else {
            return 'n/a';
        }
    };
    ProgressKeeper.prototype.formatTime = function (timeInSeconds) {
        var hours = Math.floor(timeInSeconds / 3600);
        var minutes = Math.floor((timeInSeconds % 3600) / 60);
        return hours > 0 // conditional time formatting
            ? "~" + hours + "h " + minutes + "m"
            : minutes > 0
                ? "~" + minutes + "m"
                : '<1m';
    };
    return ProgressKeeper;
}());
var ProgressBarReporter = /** @class */ (function (_super) {
    __extends(ProgressBarReporter, _super);
    function ProgressBarReporter(log, options) {
        var _this = _super.call(this) || this;
        _this.log = log;
        _this.options = options;
        _this.out = process.stdout;
        _this.files = [];
        _this.failedMessages = {};
        _this.workingDirectory = process.cwd() + "/";
        return _this;
    }
    ProgressBarReporter.prototype.makeRelative = function (fileName) {
        if (fileName.indexOf(this.workingDirectory) === 0) {
            return fileName.replace(this.workingDirectory, "");
        }
        return fileName;
    };
    ProgressBarReporter.prototype.onAllMutantsMatchedWithTests = function (matchedMutants) {
        _super.prototype.onAllMutantsMatchedWithTests.call(this, matchedMutants);
        var progressBarContent = 'Mutation testing  [:bar] :percent (elapsed: :et, remaining: :etc) :tested/:total tested (:survived survived, :timedOut timed out)';
        this.files = matchedMutants.reduce(function (results, mutant) {
            if (results.indexOf(mutant.fileName) != -1) {
                return results;
            }
            return __spreadArrays(results, [mutant.fileName]);
        }, []);
        for (var _i = 0, _a = this.files; _i < _a.length; _i++) {
            var mutant = _a[_i];
            this.out.write("##teamcity[testStarted parentNodeId='0' nodeId='" + mutant + "' name='" + this.makeRelative(mutant) + "' running='true']\r\n");
        }
        this.out.write("##teamcity[testCount count='" + this.progress.total + "']");
        this.progressBar = new ProgressBar(progressBarContent, {
            complete: '=',
            incomplete: ' ',
            stream: process.stdout,
            total: this.progress.total,
            width: 50
        });
    };
    ProgressBarReporter.prototype.onMutantTested = function (result) {
        this.out.write("##teamcity[testStarted parentNodeId='" + result.sourceFilePath + "' nodeId='" + result.sourceFilePath + ":" + result.id + "' name='" + this.makeRelative(result.sourceFilePath) + "' running='true']\r\n");
        if (result.status === report_1.MutantStatus.Survived) {
            var message = chalk.cyan(result.sourceFilePath) + ":" + chalk.yellow(result.location.start.line + 1) + ":" + chalk.yellow(result.location.start.column + 1) + "\n";
            message += chalk.red("- " + result.originalLines) + "\n";
            message += chalk.green("+ " + result.mutatedLines);
            message = message
                .replace(/\|/g, '||')
                .replace(/\r/g, '|r')
                .replace(/\n/g, '|n')
                .replace(/\\/g, '|')
                .replace(/\[/g, '|[')
                .replace(/]/g, '|]')
                .replace(/'/g, "|'");
            this.out.write("##teamcity[testFailed message='" + message + "' parentNodeId='" + result.sourceFilePath + "' nodeId='" + result.sourceFilePath + ":" + result.id + "' name='" + this.makeRelative(result.sourceFilePath) + "']\r\n");
            this.failedMessages[result.sourceFilePath] = (this.failedMessages[result.sourceFilePath] || []);
            this.failedMessages[result.sourceFilePath].push(message);
        }
        else
            this.out.write("##teamcity[testFinished parentNodeId='" + result.sourceFilePath + "' nodeId='" + result.sourceFilePath + ":" + result.id + "' name='" + this.makeRelative(result.sourceFilePath) + "']\r\n");
        _super.prototype.onMutantTested.call(this, result);
    };
    ProgressBarReporter.prototype.onAllMutantsTested = function (results) {
        for (var _i = 0, _a = this.files; _i < _a.length; _i++) {
            var mutant = _a[_i];
            if (this.failedMessages[mutant]) {
                this.out.write("##teamcity[testFailed parentNodeId='0' nodeId='" + mutant + "' name='" + this.makeRelative(mutant) + "' message='']\r\n");
            }
            else
                this.out.write("##teamcity[testFinished parentNodeId='0' nodeId='" + mutant + "' name='" + this.makeRelative(mutant) + "']\r\n");
        }
    };
    ;
    ProgressBarReporter.prototype.onMutationTestReportReady = function (report) {
        var metricsResult = mutation_testing_metrics_1.calculateMetrics(report.files);
        this.out.write("\r\n");
        this.out.write(new ClearTextScoreTable_1["default"](metricsResult, this.options.thresholds).draw());
        this.out.write("\r\n\r\n");
    };
    ProgressBarReporter.prototype.tick = function (tickObj) {
        this.progressBar.tick(tickObj);
    };
    ProgressBarReporter.prototype.render = function (renderObj) {
        this.progressBar.render(renderObj);
    };
    ProgressBarReporter.inject = typed_inject_1.tokens(plugin_1.commonTokens.logger, plugin_1.commonTokens.options);
    return ProgressBarReporter;
}(ProgressKeeper));
exports["default"] = ProgressBarReporter;
exports.strykerPlugins = [
    plugin_2.declareClassPlugin(plugin_2.PluginKind.Reporter, 'intellij', ProgressBarReporter)
];
