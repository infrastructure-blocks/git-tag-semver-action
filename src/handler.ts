import { getVersionTags, GitTagVersion } from "./version.js";
import * as core from "@actions/core";
import { createGitCli, GitCli } from "./git.js";
import semver from "semver";

// TODO: move into lib?
export type Outputs = Record<string, string>;

export interface Handler<O extends Outputs> {
  handle(): Promise<O>;
}

export interface Config {
  version: GitTagVersion;
}

export interface GitTagSemverOutputs extends Outputs {
  tags: string;
}

export class GitTagSemverHandler implements Handler<GitTagSemverOutputs> {
  private static ERROR_NAME = "GitTagSemverHandlerError";

  private readonly config: Config;
  private readonly git: GitCli;

  constructor(params: { config: Config; git: GitCli }) {
    const { config, git } = params;
    this.config = config;
    this.git = git;
  }

  async handle(): Promise<GitTagSemverOutputs> {
    await this.whitelistGitRepository();
    const latestTag = await this.getLatestTag();
    const tags = getVersionTags({
      currentVersion: latestTag,
      releaseType: this.config.version,
    });
    await this.tagAndPublish({ tags });
    return {
      tags: JSON.stringify(tags),
    };
  }

  private async whitelistGitRepository() {
    core.debug("whitelisting /github/workspace as safe git directory");
    /*
    Configure git to work with repos that are shared through volume in actions runtime.
    This is done here, at runtime as opposed to the docker image because the $HOME folder is overridden as a
    shared volume at runtime. It looks from the docs that it could be merged and not completely lost, we'll
    have to test.

    TODO: test setting that up in the image.
     */
    await this.git.run([
      "config",
      "--global",
      "--add",
      "safe.directory",
      "/github/workspace",
    ]);
  }

  private async getLatestTag(): Promise<string> {
    const versionTags = await this.git.getRemoteTags({
      pattern: "v*",
    });
    if (core.isDebug()) {
      core.debug(`found version tags: ${JSON.stringify(versionTags)}`);
    }
    // It's possible that there are no version tags. For example, when it's the first published version.
    // In which case, we simply start at v0.0.0 and apply the version bump on that.
    if (versionTags.length === 0) {
      return "v0.0.0";
    }

    // Remove partials.
    const semverTags = versionTags.filter((tag) => semver.valid(tag) != null);
    if (semverTags.length === 0) {
      throw new Error(
        `found version tags but no fully compliant version tag: ${JSON.stringify(
          versionTags
        )}`
      );
    }

    // Sort and pick the last one.
    semverTags.sort(semver.rcompare);
    return semverTags[0];
  }

  private async tagAndPublish(params: { tags: ReadonlyArray<string> }) {
    const { tags } = params;
    for (const tag of tags) {
      core.info(`tagging HEAD with: ${tag}`);
      // Have to tag force here to update an existing tag.
      await this.git.tag({ tag, force: true });
    }

    for (const tag of tags) {
      core.info(`pushing tag ${tag} to remote`);
      // Have to push force here too to update the remote tags if one already existed.
      await this.git.push({ ref: tag, force: true });
    }
  }
}

export function createHandler(params: {
  config: Config;
}): Handler<GitTagSemverOutputs> {
  const { config } = params;
  return new GitTagSemverHandler({
    config,
    git: createGitCli(),
  });
}
