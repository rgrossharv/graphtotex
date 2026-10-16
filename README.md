# GraphToTeX

2D and 3D graphing and commutative diagrams with TikZ/TikZ-CD export. A citation workspace is retained in the source but is not enabled on the website yet.

Run locally with `npm install` and `npm run dev`. Build with `npm run build`.

The production build prerenders the existing React interface into real HTML for `/`, `/3d/`, and `/diagram/`, including a distinct title, description, canonical URL, social metadata, and structured data for each workspace. JavaScript mounts the interactive app as before, so local diagram drafts and responsive behavior are preserved. Canvas fallback text and the diagram description also provide text alternatives without changing the visual layout.

Navigation uses ordinary links and the History API. Existing `/#3d`, `/#diagram`, and `/#2d` bookmarks still open the right workspace and are normalized to its canonical path. Direct URLs, including `/diagram` and `/3d`, work on GitHub Pages through the generated directories (Pages adds the trailing slash). Back/forward navigation works without reloading the app.

`scripts/prerender.mjs` generates the deployed sitemap from `src/lib/pages.ts` and copies `robots.txt` and `CNAME` into `dist`. Deploy the entire `dist` directory using the existing GitHub Pages workflow. To check the production output locally, run `npm run build`, `npm run test:seo`, and `npm run preview`. The deployment workflow also checks that each page contains crawlable HTML, correct metadata, and valid asset links before publishing.

After deployment, submit `https://graphtotex.com/sitemap.xml` in Google Search Console and inspect the three workspace URLs to request indexing. Search engines control when pages are crawled and indexed.

Built by Ryland Gross with Codex assistance; GPT 6.1 sol also worked on the project.

Citation metadata: [CITATION.cff](CITATION.cff) and [BibTeX](citation/graph-to-tex.bib). See [LICENSE](LICENSE).
