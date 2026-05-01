---
name: file-organization
description: Guidelines for where to put or move source files. Use when deciding file placement, directory structure, or refactoring file locations.
---

# File Organization Guidelines

Follow these rules when deciding where to place, organize, or move source files.

## Avoid generic helper modules

All modules should have meaningful names, rather than vague ones like `helper` or `util`. If another module needs some additional functionality, it's fine to include any additional functions/classes in the existing module as long as it remains coherent. It's also fine to export those functions/classes for testing purposes, but if they need to be used by other modules they should be refactored into a separate module.
