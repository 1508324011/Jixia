# Jixia GitHub Repository Settings Checklist

This checklist records the settings that should be applied once the public GitHub repository exists.

Published repository: `https://github.com/1508324011/Jixia`

## Repository Metadata

- repository name: `Jixia`
- visibility: public
- add a short description that matches the README
- add topics for research collaboration, server-first, lab software, and open source

## Repository Protection

- enable branch protection for `main`
- require pull request review before merge when collaboration expands
- enable secret scanning and push protection
- enable Dependabot alerts
- enable private vulnerability reporting

## Collaboration Surface

- confirm bug and feature issue templates are visible
- confirm the pull request template is visible
- confirm README, README_CN, LICENSE, and SECURITY are rendered correctly on GitHub

## Publication Follow-Ups

- `.github/ISSUE_TEMPLATE/config.yml` now points to `https://github.com/1508324011/Jixia/security/advisories/new`.
- Confirm the private vulnerability reporting link resolves to the published repository.

## Local Git Bootstrap Checkpoints

Local git initialization remains incomplete until all of the following are true:

- `git status` succeeds
- the default branch is `main`
- the working tree is clean after bootstrap changes are committed
