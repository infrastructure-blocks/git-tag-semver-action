# Main container
# Github actions runs the container with some specific configuration:
# - The user is root
# - The $HOME environment variable is set to /github/home and shared as a volume from the runner folder: /home/runner/work/_temp/_github_home
# - The workdir is set to /github/workspace
# - Contrary to their documentation, the inputs are correctly passed as INTPUT_* environment variables
FROM ubuntu:22.04 AS nvm

ENV NVM_DIR=/usr/local/lib/nvm
SHELL ["/bin/bash", "-c"]

COPY .nvmrc ./
# Installs the node version of the project.
RUN apt-get update && \
    # Curl is required by NVM to install nodejs. \
    apt-get install -y git curl && \
    git clone https://github.com/nvm-sh/nvm.git "${NVM_DIR}" && \
    pushd "${NVM_DIR}" && \
    git checkout `git describe --abbrev=0 --tags --match "v[0-9]*" $(git rev-list --tags --max-count=1)` && \
    # Moving out of the directory is required to workaround a bug in the nvm.sh script.
    popd && \
    # Not trying to install on sourcing. There is a weird behaviour with the exit code otherwise. \
    # See here: https://github.com/nvm-sh/nvm/issues/1985
    \. "${NVM_DIR}/nvm.sh" --no-use && \
    nvm install && \
    nvm cache clear && \
    # Install the node version's binary globally
    ln -sr $NVM_BIN/* /usr/local/bin && \
    apt-get purge -y git curl && \
    apt-get autoremove -y && \
    # Cleanup
    rm -rf /var/lib/apt/lists/*

FROM ubuntu:22.04 AS dependencies

RUN apt-get update && \
    apt-get install -y git && \
    apt-get autoremove -y && \
    # Cleanup
    rm -rf /var/lib/apt/lists/*

FROM nvm as build

COPY tsconfig.json tsconfig.build.json package.json package-lock.json /action/
COPY src /action/src

RUN cd /action/ && \
    npm install && \
    npm run build && \
    npm prune --production && \
    rm -rf src tsconfig.json tsconfig.build.json

FROM gcr.io/distroless/cc-debian12:debug

COPY --from=nvm /usr/local/lib/nvm /usr/local/lib/nvm
COPY --from=nvm /usr/local/bin/* /usr/local/bin/

COPY --from=dependencies /usr/bin/git /usr/bin/git
COPY --from=dependencies /usr/bin/ln /usr/bin/ln

COPY --from=build /action /action

#RUN ["ln", "-sr" , "", "/usr/local/bin"]

ENTRYPOINT ["node", "/action/dist/index.js"]
#ENTRYPOINT ["npm", "i", "-g", "prettier"]
