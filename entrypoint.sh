#!/usr/bin/env bash

git config --global --add safe.directory /github/workspace

env INPUT_VERSION="${1}" node /action/dist/index.js
