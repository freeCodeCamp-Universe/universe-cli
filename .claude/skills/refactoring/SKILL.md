---
name: refactoring
description: Guidelines and best practices for code refactoring. Use when restructuring or improving existing code without changing its external behavior.
---

# Refactoring

## Interace segration principle (ISP)

Look for violations of ISP. i.e. a class that has to implement dummy methods because it needs to satisfy an interface, but those methods are never used.
