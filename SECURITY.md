# Security Policy

## Supported Versions

Security fixes are provided for the latest published prerelease or stable release only.
Older builds should be upgraded before a report is evaluated against current behavior.

## Reporting a Vulnerability

Do not disclose a suspected vulnerability in a public issue, discussion, pull request, or
log. Use GitHub private vulnerability reporting:

https://github.com/Stefany-Campanhoni/vsrg-skin-converter/security/advisories/new

If private vulnerability reporting is unavailable, email `scampanhoni@gmail.com`. Include a
concise impact description, affected version, reproduction steps, and any suggested
mitigation. Sanitize game paths, profiles, configuration, screenshots, and logs; never send
credentials or unrelated personal data.

You should receive an acknowledgement within seven days. Please allow time to validate and
prepare a coordinated fix before publishing technical details.

## Scope

Security-sensitive areas include untrusted Lua/INI/config parsing, path traversal, filesystem
publication and rollback, archive/release assembly, bundled dependencies, and secret
exposure. The converter statically analyzes skin Lua and must never execute it.
