import {MatchedMutant, MutantResult, Reporter, mutationTestReportSchema} from '@stryker-mutator/api/report';
import { StrykerOptions } from '@stryker-mutator/api/core';
import { commonTokens } from '@stryker-mutator/api/plugin';
import {MutantStatus} from '@stryker-mutator/api/report';
import ProgressBar = require('progress');
import {declareClassPlugin, PluginKind} from '@stryker-mutator/api/plugin';
import ClearTextScoreTable from '@stryker-mutator/core/src/reporters/ClearTextScoreTable'
import chalk = require('chalk');
import { calculateMetrics } from 'mutation-testing-metrics';
import { tokens } from 'typed-inject';



class Timer {
    private readonly now: () => Date;
    private start: Date;
    private markers: {
        [name: string]: Date;
    };

    constructor(now = () => new Date()) {
        this.now = now;
        this.reset();
    }

    public reset() {
        this.markers = Object.create(null);
        this.start = this.now();
    }

    public humanReadableElapsed() {
        const elapsedSeconds = this.elapsedSeconds();
        return Timer.humanReadableElapsedMinutes(elapsedSeconds) + Timer.humanReadableElapsedSeconds(elapsedSeconds);
    }

    public elapsedSeconds() {
        const elapsedMs = this.elapsedMs();
        return Math.floor(elapsedMs / 1000);
    }

    public elapsedMs(sinceMarker?: string) {
        if (sinceMarker && this.markers[sinceMarker]) {
            return this.now().getTime() - this.markers[sinceMarker].getTime();
        } else {
            return this.now().getTime() - this.start.getTime();
        }
    }

    public mark(name: string) {
        this.markers[name] = this.now();
    }

    private static humanReadableElapsedSeconds(elapsedSeconds: number) {
        const restSeconds = elapsedSeconds % 60;
        if (restSeconds === 1) {
            return `${restSeconds} second`;
        } else {
            return `${restSeconds} seconds`;
        }
    }

    private static humanReadableElapsedMinutes(elapsedSeconds: number) {
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        if (elapsedMinutes > 1) {
            return `${elapsedMinutes} minutes `;
        } else if (elapsedMinutes > 0) {
            return `${elapsedMinutes} minute `;
        } else {
            return '';
        }
    }
}

abstract class ProgressKeeper implements Reporter {
    private timer: Timer;
    protected progress = {
        survived: 0,
        timedOut: 0,
        tested: 0,
        total: 0,
    };

    private mutantIdsWithoutCoverage: string[];

    public onAllMutantsMatchedWithTests(matchedMutants: readonly MatchedMutant[]): void {
        this.timer = new Timer();
        this.mutantIdsWithoutCoverage = matchedMutants.filter((m) => !m.runAllTests && m.scopedTestIds.length === 0).map((m) => m.id);
        this.progress.total = matchedMutants.length - this.mutantIdsWithoutCoverage.length;
    }

    public onMutantTested(result: MutantResult): void {
        if (!this.mutantIdsWithoutCoverage.some((id) => result.id === id)) {
            this.progress.tested++;
        }
        if (result.status === MutantStatus.Survived) {
            this.progress.survived++;
        }
        if (result.status === MutantStatus.TimedOut) {
            this.progress.timedOut++;
        }
    }

    protected getElapsedTime() {
        return this.formatTime(this.timer.elapsedSeconds());
    }

    protected getEtc() {
        const totalSecondsLeft = Math.floor((this.timer.elapsedSeconds() / this.progress.tested) * (this.progress.total - this.progress.tested));

        if (isFinite(totalSecondsLeft) && totalSecondsLeft > 0) {
            return this.formatTime(totalSecondsLeft);
        } else {
            return 'n/a';
        }
    }

    private formatTime(timeInSeconds: number) {
        const hours = Math.floor(timeInSeconds / 3600);

        const minutes = Math.floor((timeInSeconds % 3600) / 60);

        return hours > 0 // conditional time formatting
            ? `~${hours}h ${minutes}m`
            : minutes > 0
                ? `~${minutes}m`
                : '<1m';
    }
}


export default class ProgressBarReporter extends ProgressKeeper {
    public static inject = tokens(commonTokens.logger, commonTokens.options);

    private progressBar: ProgressBar;

    private readonly out: NodeJS.WritableStream = process.stdout;
    private files: string[] = [];
    private failedMessages: {[fileName: string]: string[]} = {};
    private workingDirectory = `${process.cwd()}/`;

    constructor(private readonly log: any, private readonly options: StrykerOptions) {
        super();
    }

    private makeRelative(fileName: string): string {
        if (fileName.indexOf(this.workingDirectory) === 0) {
            return fileName.replace(this.workingDirectory, "");
        }

        return fileName
}

    public onAllMutantsMatchedWithTests(matchedMutants: readonly MatchedMutant[]): void {
        super.onAllMutantsMatchedWithTests(matchedMutants);
        const progressBarContent =
            'Mutation testing  [:bar] :percent (elapsed: :et, remaining: :etc) :tested/:total tested (:survived survived, :timedOut timed out)';

        this.files = matchedMutants.reduce((results, mutant) => {
            if (results.indexOf(mutant.fileName) != -1) {
                return results;
            }

            return [...results, mutant.fileName];
        }, [])
        for (const mutant of this.files) {
            this.out.write(`##teamcity[testStarted parentNodeId='0' nodeId='${mutant}' name='${this.makeRelative(mutant)}' running='true']\r\n`)
        }

        this.out.write(`##teamcity[testCount count='${this.progress.total}']`)

        this.progressBar = new ProgressBar(progressBarContent, {
            complete: '=',
            incomplete: ' ',
            stream: process.stdout,
            total: this.progress.total,
            width: 50,
        });
    }

    public onMutantTested(result: MutantResult): void {
        const startLocation = `${result.location.start.line + 1}:${result.location.start.column + 1}`
        const endLocation = `${result.location.end.line + 1}:${result.location.end.column + 1}`

        const locationHint = `locationHint='stryker-mutant://${this.makeRelative(result.sourceFilePath)}::${startLocation}::${endLocation}'`
        const parentNode = `parentNodeId='${result.sourceFilePath}'`
        const name = `name='${this.makeRelative(result.sourceFilePath)}'`
        const nodeId = `nodeId='${result.sourceFilePath}:${result.id}'`
        const nodeType = `nodeType='test'`
        const compare = `expected='${this.escape(result.originalLines)}' actual='${this.escape(result.mutatedLines)}'`

        this.out.write(`##teamcity[testStarted ${parentNode} ${nodeId} ${name} ${locationHint} ${nodeType} running='true']\r\n`)

        if (result.status === MutantStatus.Survived) {
            let message = `${chalk.cyan(result.sourceFilePath)}:${chalk.yellow(result.location.start.line + 1)}:${chalk.yellow(result.location.start.column + 1)}` + "\n"
            message += chalk.red(`- ${result.originalLines}`) + "\n";
            message += chalk.green(`+ ${result.mutatedLines}`);

            message = this.escape(message)

            this.out.write(`##teamcity[testFailed message='${message}' ${parentNode} ${locationHint} ${nodeId} ${name} ${nodeType}]\r\n`)
            this.failedMessages[result.sourceFilePath] = (this.failedMessages[result.sourceFilePath] || []);
            this.failedMessages[result.sourceFilePath].push(message);
        }
        else this.out.write(`##teamcity[testFinished ${parentNode} ${locationHint} ${nodeId} ${name} ${nodeType}]\r\n`)

        super.onMutantTested(result);
    }

    private escape(message: string) {
        return message
            .replace(/\|/g, '||')
            .replace(/\r/g, '|r')
            .replace(/\n/g, '|n')
            .replace(/\\/g, '|')
            .replace(/\[/g, '|[')
            .replace(/]/g, '|]')
            .replace(/'/g, "|'");
    }

    public onAllMutantsTested(results: MutantResult[]) {
        for (const mutant of this.files) {
            if (this.failedMessages[mutant]) {
                this.out.write(`##teamcity[testFailed parentNodeId='0' nodeId='${mutant}' name='${this.makeRelative(mutant)}' message='']\r\n`)
            }
             else this.out.write(`##teamcity[testFinished parentNodeId='0' nodeId='${mutant}' name='${this.makeRelative(mutant)}']\r\n`)
        }
    };

    public onMutationTestReportReady(report: mutationTestReportSchema.MutationTestResult) {
        const metricsResult = calculateMetrics(report.files);
        this.out.write("\r\n");
        this.out.write(new ClearTextScoreTable(metricsResult, this.options.thresholds).draw());
        this.out.write("\r\n\r\n");
    }


    private tick(tickObj: object): void {
        this.progressBar.tick(tickObj);
    }

    private render(renderObj: object): void {
        this.progressBar.render(renderObj);
    }
}

export const strykerPlugins = [
    declareClassPlugin(PluginKind.Reporter, 'intellij', ProgressBarReporter)
]
