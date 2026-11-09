# Security policy

## Supported versions

Only the latest stable release, the one the Obsidian community directory serves, gets security fixes. Beta builds from BRAT are for testing.

## Reporting a vulnerability

Please report privately through GitHub: **Security → Report a vulnerability** on this repository ([direct link](https://github.com/QR4X/Corvus/security/advisories/new)). Don't open a public issue for a security problem.

In scope:

- how API keys are stored or sent;
- the agent's path sandbox (reading or writing outside the vault, path traversal);
- prompt injection in a note or web page that leads the agent to write or delete files without the confirmation it should show;
- any network request not listed under [Disclosures](README.md#disclosures).

You can expect a first reply within about 7 days. Corvus is maintained by one person, so please allow time for a fix before disclosing publicly.
