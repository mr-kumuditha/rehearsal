# Reports people can read, evidence people can inspect

There are two different PDF downloads in the studio.

## A report for one run

After an experiment finishes, choose **PDF** in the trace footer or **Export PDF** below the business checks. A saved history entry opens the same export controls. Comparison cards also have a PDF report button.

The browser lazily loads `src/lib/report-pdf.ts`. It creates an actual PDF without sending the report to a third-party rendering service and without requesting new backend execution. The export includes:

- Scenario, strategy, timestamps, full run ID and recorded transport.
- Business checks with expected and observed values.
- Committed-operation counts and an elapsed-event chart.
- Every original event, with pagination for longer traces.
- The original JSON attached to the PDF; the separate JSON download remains available for readers whose PDF viewer does not expose attachments.

PDF metadata and page footers credit **Tharinda.dev**. Standard PDF fonts keep the browser download small. Report text uses an English-compatible punctuation fallback. Reports are not digitally signed, and a passing sandbox run is not a production guarantee.

The transport field comes from the historical report. Exporting an old direct-HTTP report does not relabel it as gateway-backed just because the current deployment changed.

## The illustrated project guide

**Project PDF** and **Download project guide** serve `public/docs/rehearsal-project-guide.pdf`. This is a 14-page explanation of the project, not a report for the current visitor. It contains actual local-interface screenshots and separately captured hosted experiment results, explicitly labelled to avoid mixing their evidence boundaries.

Editable source:

- `scripts/project-guide-template.mjs`: text, layout, vector diagrams and graphs.
- `scripts/build-project-guide.mjs`: evidence capture, screenshots, font embedding and PDF rendering.
- `docs/evidence/project-guide-runs.json`: eight real hosted run reports, with capture time and the checked-out base commit.
- `docs/evidence/guide-studio.png` and `guide-compare.png`: actual interface captures.

From the repository with Node 24 and Google Chrome installed:

```sh
# Rebuild offline from the retained evidence and screenshots.
node scripts/build-project-guide.mjs

# With the local studio running: capture fresh hosted runs and local screenshots.
node scripts/build-project-guide.mjs --capture

# Retake only local UI images, preserving the existing hosted evidence.
node scripts/build-project-guide.mjs --capture-ui
```

`GUIDE_UI_ORIGIN` can select a different controlled preview; the default is localhost:3040. `PLAYWRIGHT_CHANNEL` can select an installed Chromium channel. Capture makes isolated sandbox runs and deliberately omits workspace cookies and authentication headers from the saved evidence.

The builder rejects content that extends off a page or overlaps its footer. It preserves live timings rather than inventing benchmark numbers. It also emits an actual-run sample PDF and a self-contained HTML preview under ignored `work/pdf-review/`.

## Checks performed

The 14-page guide and four-page sample run export were rendered and visually reviewed. Text extraction confirmed the developer credit and gateway evidence labels; the sample contains its JSON attachment. Local tests passed: 25 automated tests, including PDF metadata, attachments, long-trace pagination and punctuation handling; five browser tests, including an actual PDF download and the project guide link. Desktop and mobile-width/reduced-motion behavior were checked. These are Chrome checks, not cross-browser certification or a formal PDF accessibility audit.

The 12ui draft service denied generation because the existing credential lacked the required scope. No new 12ui-generated design is claimed. The retouch preserves the existing green visual identity and adds clearer export controls, first-run guidance, readable comparison charts and developer credit.
