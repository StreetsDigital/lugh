# PR Review

Review this PR/diff thoroughly:

1. **Security**: SQL injection, XSS, auth bypass, secrets exposed
2. **Performance**: N+1 queries, missing indexes, unbounded loops
3. **Tests**: Coverage adequate? Edge cases handled?
4. **Error handling**: Errors caught? Meaningful messages?
5. **Code quality**: DRY, naming, complexity

Format:
- 🔴 Blockers (must fix)
- 🟡 Concerns (should fix)
- 🟢 Nitpicks (optional)
- ✅ What's good

Be specific with line numbers and suggestions.
