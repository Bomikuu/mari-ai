# Telegram setup: Node network family timeout

The later [Telegram conversation extension](2026-11-07-telegram-conversation-verification.md)
made the 2000 ms allowance automatic in the Telegram client. Ordinary npm
starts now include the fix. The runtime-only workaround below records the
initial diagnosis and has been superseded.

On November 7, 2026 (Asia/Manila), the first live bot connection failed
with `Telegram could not confirm this request. Check the connection and retry.`
No bot token or private Telegram message was inspected during diagnosis.

## Observed cause

The host resolved api.telegram.org to both IPv4 and IPv6. curl reached the
official endpoint, but Node 24's default network family selection timed out
the IPv4 attempt and immediately encountered an unreachable IPv6 network.
The request therefore failed before Telegram could validate the bot token.

A credential-free POST to a synthetic invalid bot's getMe endpoint reproduced
`ETIMEDOUT` for IPv4 and `ENETUNREACH` for IPv6. Increasing the connection
attempt allowance to 2000 milliseconds reached Telegram and returned its
expected JSON 401 rejection in approximately 0.9 seconds. Disabling network
family selection also reached the endpoint, but the running Mari session
uses the longer allowance and keeps both address families available.

## Current session and future starts

Mari's verified local process was stopped gracefully with no active jobs or
project services. Its backend and ordinary worker were reopened with:

```sh
node --network-family-autoselection-attempt-timeout=2000 ...
```

The owner setup was reopened in Firefox without printing its pairing key.
This is a runtime adjustment; application source and the default npm launch
commands have not been changed. For subsequent ordinary starts on this host,
the equivalent environment setting reaches both backend and worker:

```sh
NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000 npm start
```

If NODE_OPTIONS already contains other required options, retain those when
adding this flag. Do not start a second instance while Mari is running.

The actual connector was also checked with a synthetic invalid token and
returned a confirmed Telegram rejection rather than a transport failure.
No Telegram messages were sent by these probes. The owner still needs to
retry their real token in Mari's local password field, then complete the
phone pairing and browser confirmation before a live command can be tested.
