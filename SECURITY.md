# Security Policy

The browser entrypoint processes selected folders locally and never uploads source assets,
profiles or diagnostics. Folder handles are requested in read mode; outputs are downloadable
ZIPs and installation remains manual. No source selections are stored. The only session
storage entry is a non-personal isolation reload marker. Source paths are scoped, opaque
asset identities must belong to registered sources, and present unsafe/unreadable files
are fatal. Image/source files are bounded to 32 MiB, decoded images to 16 megapixels, and
generated files to 256 MiB. Lua is analyzed statically and is never executed. WASM, worker,
templates and service worker resources ship locally without external runtime services.
Review artwork uses locally rendered, bounded PNG thumbnails rather than original source
URLs. Temporary thumbnail Blob URLs are revoked when replaced, reset or the page exits;
changing language or theme retains the current preview. Neither thumbnails nor folder
selection metadata are persisted.

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
