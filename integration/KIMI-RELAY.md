# Reuse the existing protected Kimi host

The current six-axis source identifies `https://s52xzsn2ztf64.kimi.site/api/chat` in `six-axis-agent/agent.mjs`. This studio copies that transport pattern, replaces the robot system instruction with `PUPPET_SYSTEM`, and validates only the puppet design schema. The key stays on the existing host.

## First check

Use **AI connection → Test connection** in the studio. The app sends its own puppet system instruction and an `application: "shadow-puppet-studio"` discriminator. If the existing Kimi route accepts client-supplied system instructions, it can serve the new app without a backend change.

If it enforces robot-specific instructions or validates only robot tasks, a separate route is needed. Do not replace `ROBOT_SYSTEM` globally: that would change the working robot app.

## Dedicated route

The supplied `next-puppet-route.ts` can be installed as `app/api/puppet/route.ts` in a compatible Next.js host. Copy the project modules `server/api.mjs`, `public/agent.mjs`, and `public/model.mjs` under a `puppet/` directory preserving their relative paths, then adjust the route's import path accordingly.

Reuse the host's existing server-side `ALIBABA_API_KEY` environment binding, plus its actual base URL and model. If the host uses another key variable name, map that existing binding in the route; do not paste it into source. The module also recognizes `QIANWEN_API_KEY` and `DASHSCOPE_API_KEY`.

The dedicated route requires a server-side provider configuration. It will not forward recursively to the old Kimi endpoint. It retains bounded inputs, pinned puppet instructions, server-side provider calls, CORS allowlisting, and output limits. The original `/api/chat` route is unchanged.

After deploying this route to Kimi, change `RELAY` in `public/agent.mjs` to `https://s52xzsn2ztf64.kimi.site/api/puppet`, rebuild and redeploy this studio. If source is maintained in `bnta-robotics`, preserve the puppet route alongside the robot route as a separate module rather than replacing the robot instruction.

Allowed browser origins in the sample are the user's GitHub Pages host, this studio's ChatGPT Site, and local development. CORS is not authentication. The existing host's access controls and provider quotas still apply; the per-process rate limiter is a best-effort guard, not a global spending cap.

## Acceptance check

1. A robot hello still produces a valid robot response.
2. A studio request for a blue robe proposes `design.primary`, not robot actions.
3. A selected, locked part retains its dimensions.
4. The student can discard the proposal without changing the character.
5. Inspect the browser network payload: no provider key is present.

Live Kimi deployment was not changed by creating these source files.
