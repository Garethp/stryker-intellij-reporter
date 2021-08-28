import {
  MatchedMutant,
  MutantResult,
  Reporter,
  mutationTestReportSchema,
} from "@stryker-mutator/api/report";
import { StrykerOptions } from "@stryker-mutator/api/core";
import { commonTokens } from "@stryker-mutator/api/plugin";
import { MutantStatus } from "@stryker-mutator/api/report";
import ProgressBar = require("progress");
import { declareClassPlugin, PluginKind } from "@stryker-mutator/api/plugin";
import { ClearTextScoreTable } from "@stryker-mutator/core/dist/src/reporters/clear-text-score-table";
import chalk = require("chalk");
import { calculateMetrics } from "mutation-testing-metrics";
import { tokens } from "typed-inject";

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
    return (
      Timer.humanReadableElapsedMinutes(elapsedSeconds) +
      Timer.humanReadableElapsedSeconds(elapsedSeconds)
    );
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
      return "";
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

  public onAllMutantsMatchedWithTests(
    matchedMutants: readonly MatchedMutant[]
  ): void {
    this.timer = new Timer();
    this.mutantIdsWithoutCoverage = matchedMutants
      .filter(
        //@ts-ignore
        (m) => !m.runAllTests && !(m.testFilter || m.scopedTestIds)?.length
      )
      .map((m) => m.id);
    this.progress.total =
      matchedMutants.length - this.mutantIdsWithoutCoverage.length;
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
    const totalSecondsLeft = Math.floor(
      (this.timer.elapsedSeconds() / this.progress.tested) *
        (this.progress.total - this.progress.tested)
    );

    if (isFinite(totalSecondsLeft) && totalSecondsLeft > 0) {
      return this.formatTime(totalSecondsLeft);
    } else {
      return "n/a";
    }
  }

  private formatTime(timeInSeconds: number) {
    const hours = Math.floor(timeInSeconds / 3600);

    const minutes = Math.floor((timeInSeconds % 3600) / 60);

    return hours > 0 // conditional time formatting
      ? `~${hours}h ${minutes}m`
      : minutes > 0
      ? `~${minutes}m`
      : "<1m";
  }
}

export default class ProgressBarReporter extends ProgressKeeper {
  public static inject = tokens(commonTokens.logger, commonTokens.options);

  private progressBar: ProgressBar;

  private readonly out: NodeJS.WritableStream = process.stdout;
  private mutantsPerFile: { [fileName: string]: number } = {};
  private failedMessages: { [fileName: string]: string[] } = {};
  private workingDirectory = `${process.cwd()}/`;

  constructor(
    private readonly log: any,
    private readonly options: StrykerOptions
  ) {
    super();
  }

  private makeRelative(fileName: string): string {
    if (fileName.indexOf(this.workingDirectory) === 0) {
      return fileName.replace(this.workingDirectory, "");
    }

    return fileName;
  }

  public onAllMutantsMatchedWithTests(
    matchedMutants: readonly MatchedMutant[]
  ): void {
    super.onAllMutantsMatchedWithTests(matchedMutants);
    const progressBarContent =
      "Mutation testing  [:bar] :percent (elapsed: :et, remaining: :etc) :tested/:total tested (:survived survived, :timedOut timed out)";

    this.mutantsPerFile = matchedMutants.reduce((results, mutant) => {
      if (results[mutant.fileName] !== undefined) {
        results[mutant.fileName]++;
        return results;
      }

      results[mutant.fileName] = 1;
      return results;
    }, {} as { [fileName: string]: number });

    for (const files of Object.keys(this.mutantsPerFile)) {
      this.out.write(
        `##teamcity[testStarted parentNodeId='0' nodeId='${files}' name='${this.makeRelative(
          files
        )}']\r\n`
      );
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

  private getSourceFile(mutant: MutantResult | MatchedMutant): string {
    //@ts-ignore
    return mutant.sourceFilePath || mutant.fileName;
  }

  public onMutantTested(result: MutantResult): void {
    const startLocation = `${result.location.start.line + 1}:${
      result.location.start.column + 1
    }`;
    const endLocation = `${result.location.end.line + 1}:${
      result.location.end.column + 1
    }`;

    const locationHint = `locationHint='stryker-mutant://${
      result.mutatorName
    }/${this.getSourceFile(result)}::${startLocation}::${endLocation}'`;
    const parentNode = `parentNodeId='${this.getSourceFile(result)}'`;
    const name = `name='${this.makeRelative(this.getSourceFile(result))}'`;
    const nodeId = `nodeId='${this.getSourceFile(result)}:${result.id}'`;
    const nodeType = `nodeType='test'`;
    const compare = `expected='${this.escape(
      result.originalLines
    )}' actual='${this.escape(result.mutatedLines)}'`;

    this.out.write(
      `##teamcity[testStarted ${parentNode} ${nodeId} ${name} ${locationHint} ${nodeType} running='true']\r\n`
    );

    if (result.status === MutantStatus.Survived) {
      let message =
        `${chalk.cyan(this.getSourceFile(result))}:${chalk.yellow(
          result.location.start.line + 1
        )}:${chalk.yellow(result.location.start.column + 1)}` + "\n";
      message += chalk.red(`- ${result.originalLines}`) + "\n";
      message += chalk.green(`+ ${result.mutatedLines}`);

      message = this.escape(message);

      this.out.write(
        `##teamcity[testFailed message='${message}' ${parentNode} ${locationHint} ${nodeId} ${name} ${nodeType}]\r\n`
      );
      this.failedMessages[this.getSourceFile(result)] =
        this.failedMessages[this.getSourceFile(result)] || [];
      this.failedMessages[this.getSourceFile(result)].push(message);
    } else
      this.out.write(
        `##teamcity[testFinished ${parentNode} ${locationHint} ${nodeId} ${name} ${nodeType}]\r\n`
      );
    this.markMutantTested(result);

    super.onMutantTested(result);
  }

  private escape(message: string) {
    return message
      .replace(/\|/g, "||")
      .replace(/\r/g, "|r")
      .replace(/\n/g, "|n")
      .replace(/\\/g, "|")
      .replace(/\[/g, "|[")
      .replace(/]/g, "|]")
      .replace(/'/g, "|'");
  }

  private markMutantTested(result: MutantResult) {
    const parentFile = this.getSourceFile(result);
    this.mutantsPerFile[parentFile]--;
    if (this.mutantsPerFile[parentFile] > 0) return;

    if (this.failedMessages[parentFile]) {
      this.out.write(
        `##teamcity[testFailed parentNodeId='0' nodeId='${parentFile}' name='${this.makeRelative(
          parentFile
        )}' message='']\r\n`
      );
    } else {
      this.out.write(
        `##teamcity[testFinished parentNodeId='0' nodeId='${parentFile}' name='${this.makeRelative(
          parentFile
        )}']\r\n`
      );
    }
  }

  public onMutationTestReportReady(
    report: mutationTestReportSchema.MutationTestResult
  ) {
    const metricsResult = calculateMetrics(report.files);
    this.out.write("\r\n");
    this.out.write(
      new ClearTextScoreTable(metricsResult, this.options.thresholds).draw()
    );
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
  declareClassPlugin(PluginKind.Reporter, "intellij", ProgressBarReporter),
];
