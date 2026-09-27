# Contributing to Orbita Desktop

First off, thank you for considering contributing to Orbita! It's people like you that make Orbita such a great project.

## Code of Conduct

By participating in this project, you agree to abide by our standards of conduct. Please be respectful and considerate of others.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible, filling out the required template.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Please provide a clear and descriptive title and fill out the provided template.

### Pull Requests

1. **Fork the repo** and create your branch from `main`.
2. **Follow the formatting**:
   - Web/TS: 2 spaces
   - Rust: 4 spaces
   - Ensure you follow the rules in `.editorconfig`.
3. **If you've added code that should be tested, add tests.**
4. **If you've changed APIs, update the documentation.**
5. **Ensure the test suite passes.**
6. **Make sure your code lints.**
7. **Issue that PR!**

## Branching Strategy

- `main` is our primary branch. All PRs should target `main` unless specified otherwise.
- For features, use `feature/feature-name`
- For bugfixes, use `fix/bug-name`
- For docs, use `docs/doc-name`

## Security First

Orbita is an E2EE messenger. Any PRs touching cryptographic implementations, the `native` Rust engine, or real-time network code will undergo intense scrutiny. Please review `SECURITY.md` if you find a vulnerability instead of opening a PR right away.
