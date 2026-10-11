<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Survey data is local-first (IndexedDB in src/lib/survey) and syncs via one server function (src/lib/survey/remote.ts) using the admin client scoped by team code — field crews work offline and share data without accounts.
- Survey tables have RLS on with no public policies; only the server function touches them — keeps team data unreachable from the browser.
- Plan image exports run locally on canvas with a project-scoped original-plan asset and UTM projection; this preserves survey geometry and source street details without fabricated labels or server map dependencies.
