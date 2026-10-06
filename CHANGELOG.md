# Changelog

## 0.1.9 — October 6, 2026

- **More Coding Agents**: Native support and pills for GitHub Copilot CLI, OpenCode, Muse Code, and Amp in addition to Claude Code, Antigravity, Gemini CLI, Cursor, and Codex.
- **Weekly Recap**: Spotify Wrapped-style weekly coding recap card and poster modal tracking coding time, sessions, files changed, +lines/-lines, commands run, and questions answered.
- **MSI Installer**: Added MSI target alongside NSIS installer for enterprise deployment and Windows Defender friendliness.

## 0.1.8 — October 5, 2026

- **Extended Integrations & Parity**: Full Windows parity for Live Activity tracking, session metrics, diff inspections, and multi-agent coordination.
- **New Greeting Score**: High-fidelity sound and particle bursts for Mochi's launch greeting.

## 0.1.7 — October 4, 2026

- **Global Keyboard Shortcuts (Win32)**:
  - `Ctrl+Alt+Space`: Open AI chat
  - `Ctrl+Alt+A`: Jump to waiting permission or question
  - `Ctrl+Alt+T`: Bring active terminal/editor forward
  - `Ctrl+Alt+]` / `Ctrl+Alt+[`: Switch next / previous pill
  - `Ctrl+Alt+M`: Mute / unmute Mochi
  - `Ctrl+Alt+D`: Toggle desktop companion (Mochi on desktop)
  - `Ctrl+Alt+G`: Open wardrobe
  - `Ctrl+Alt+W`: Attach front window to chat
  - `Ctrl+Shift+N`: Expand / collapse Dynamic Island
- **Island-Local Shortcuts**: `Ctrl+→`/`Ctrl+←` and `Ctrl+1–9` to switch pills, `Ctrl+E` for live diff, `Ctrl+K` for new chat, `Ctrl+P` to pin island, `Escape` to close/back.
- **Settings → Shortcuts**: Dedicated tab in settings with full list of global and island-local shortcuts.

## 0.1.6 — October 4, 2026

- **Mochi on the Desktop**: Drag Mochi out of the notch onto the desktop as an interactive floating companion with eye tracking, pokes, sleep mode, wardrobe access, and double-click fly-home.

## 0.1.5 — October 4, 2026

- **Mochi Wardrobe & Outfits**: Mochi has 12 unlockable outfits (Party Hat, Beanie, Crown, Sunglasses, Round Glasses, Bow, Scarf, Witch Hat, Pumpkin, Santa Hat, Bunny Ears, Seasonal Auto) with 3D projection, depth sorting, and dynamic spring physics.
- **Greeting v2**: Enhanced launch greeting animation with fall-in bounce, lateral travel, wave oscillation, streak & burst particles, and greeting sound effect with smooth fade-out.

## 0.1.4 — October 3, 2026

- See what Claude is editing, live: each file edit shows up in the session ticker with its +N −M lines, and a click opens the diff right in the notch (#177)
- When Claude finishes, the session card shows its final message instead of the last step, without the shimmer (#177, #179)
- GitHub pill: your open pull requests with their CI status, the pull requests waiting for your review, and the CI of the default branch of your recent repos. Click a row for the list, then an item to open it on github.com (#181)
- GitHub alerts: a badge and a sound when the CI of one of your pull requests turns red or green, when a default branch breaks, or when someone requests your review. Fast CI runs are caught too, and the card refreshes when you open it (#181, #185)
- Your GitHub contribution grid: the last 7 days in the GitHub card header, click it for the past 23 weeks, and click a day for its count (#187)
- The GitHub token needs read access to pull requests and CI: a classic token with the repo scope, or a fine-grained token with read access to Pull requests, Commit statuses and Actions (#181)
- The finished view no longer overflows the card (#179)

## 0.1.3 — October 3, 2026

- Answer Claude's questions from the notch: when Claude Code asks a multiple-choice question, pick an option or type your own answer right in the island, and Reply in terminal hands it back. Update your hooks in Settings to turn it on (#165) — thanks @Vega8991 for the idea (#94)
- Claude plan usage (GitHub build): turn on Settings → Agents → Plan usage to see your 5-hour and weekly limits in a small pill in the notch header, and click it for the details and reset times. Pro and Max plans; your current status line keeps working (#159)
- Chat with local models through Ollama or LM Studio, no API key needed: connect them in Settings → Chat → Local models. Answers stream in, and thinking blocks stay hidden (#156)
- Markdown in chat answers: bold, lists, headings, quotes, and code blocks with a copy button. Links open only when they are web links (#156)
- Apple Music (GitHub build): see what is playing in the notch, play, pause and skip on hover, and Mochi dances along (#144, #153)
- Settings are now organized in a sidebar (#153)
- The chat greets you by your own first name (#154)

## 0.1.2 — October 2, 2026

- Codex support (GitHub build): sessions show up live on the Codex pill, and permission requests get Allow and Deny in the notch. Install from Settings → Codex Hooks, then trust the hooks once with /hooks in Codex (#130) — thanks @lacatu5
- Cursor: Claude Code started in Cursor's terminal shows up on the Cursor pill, and you can answer its permission requests from the notch (#120).
- Pick your main coding tool in Settings → Active pills: VS Code, Cursor, Codex or Antigravity (Codex and Antigravity: GitHub build). It stays on and no longer takes one of the 4 slots (#120).
- The permission card stays in the notch until you answer it: the mouse no longer folds it, and reopening the island shows the request again (#117).
- The permission card also shows when the island is already open, and the pill you were on comes back once you answer (#120).

## 0.1.1 — October 2, 2026

- Declare the tools you use in Settings: Gemini CLI, Antigravity, Anthropic, Google AI and OpenAI pills join the existing ones (Cursor and Codex pills are coming soon), and you pick the main pill.
- Chat now supports Google AI (Gemini) and OpenAI in addition to Anthropic; switch provider and model by clicking the model name in the chat view, on macOS.
- Linux version: the Tauri app now builds for Linux too (AppImage, .deb, .rpm), with the island as a layer-shell overlay on Wayland and Claude Code hooks over a private Unix socket (#21) — thanks @Davy133
- Compact island on screens without a notch (#22) — thanks @Kamasoutra
- Only web links (http/https) open from the notch; other kinds of links from Claude or integrations are ignored (#16) — thanks @Cris1670
- Hook socket limited to your own user account, with size and time limits; logs no longer keep commands, n8n data or full URLs, and stay under 1 MB (#16) — thanks @Cris1670 and @Vignesh-Thangamariappan
- The island always reopens after folding, and Settings opens below it, resizable — thanks @rouderz
- Choose the Claude model for the chat in Settings; the list comes from your Anthropic account, and Claude Sonnet 4.6 stays the default — thanks @rouderz
- Windows build artifacts are now downloadable from a manual CI run — thanks @MysJofR
- Any agent can talk to Mochi: tag a hook payload with `coucou_agent` (e.g. `nb-hook --agent my-agent`) and it gets its own pill in the island (#7, #9) — thanks @lacatu5
- Gemini CLI and Antigravity (agy) hook support on macOS: install from Settings and their sessions show up in the island — thanks @corefusiion
