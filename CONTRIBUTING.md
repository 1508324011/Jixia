# Contributing to Jixia

Thank you for your interest in Jixia.

## Current Contribution Model

Jixia is currently maintained in an author-led model.
Issues and pull requests are welcome, but significant architecture changes should
be discussed before implementation so the project boundary does not drift by accident.

## Before You Open a Pull Request

1. read the relevant documents in `docs/plans/`
2. keep changes scoped to one task or concern
3. add or update verification when behavior or contracts change
4. explain the goal, boundary, and verification in the pull request description

## What We Will Usually Decline

- changes that bypass server-first boundaries
- changes that introduce secrets or unsafe credential handling
- changes that contradict approved plans without updating the plans

## Development Notes

As the bootstrap scaffold grows, the repository will standardize scripts,
testing expectations, and CI requirements. Until then, prefer the smallest change
that keeps the repository legible and verifiable.
