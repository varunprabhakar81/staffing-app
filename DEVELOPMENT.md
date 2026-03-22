# Development Notes

## Server restart required after editing claudeService.js

After editing `claudeService.js`, always restart the server — the system prompt and all module-level constants are loaded at startup and changes won't take effect until the Node process restarts.

```bash
# Stop the running server (Ctrl+C), then:
node server.js
```
