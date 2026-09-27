name: 🐛 Bug Report
description: Create a report to help us improve
title: "[BUG] "
labels: ["bug"]
assignees: []

body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to fill out this bug report!
  - type: input
    id: os
    attributes:
      label: OS Version
      description: What operating system and version are you using? (e.g. Windows 11, macOS 14, Ubuntu 22.04)
    validations:
      required: true
  - type: textarea
    id: reproduction
    attributes:
      label: Steps to reproduce
      description: How can we reproduce this bug?
      placeholder: |
        1. Go to '...'
        2. Click on '....'
        3. Scroll down to '....'
        4. See error
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
      description: What did you expect to happen?
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Logs / Screenshots
      description: Add any relevant logs, screenshots, or screen recordings.
