# Turning the project into contribution evidence

The goal is to submit work you can explain and reproduce. A polished interface helps someone explore it, but it does not replace a working WSO2 integration or an accepted upstream contribution.

The [WSO2 internship page](https://wso2.com/careers/internships/engineering-intern/) was checked on 6 September 2026. It asks for at least three contribution points. Recheck its rules before applying; WSO2 decides whether submitted evidence qualifies.

| Contribution                                           | Listed points   | Evidence still needed                                                                                                          |
| ------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Use a WSO2 product in a real-world project or solution | 2 per project   | A working, verified product integration, source and an understandable demo; today's standalone sandbox does not establish this |
| Fix a WSO2 documentation issue                         | 1 per merged PR | A genuine upstream problem, a technically correct fix and the merged PR URL                                                    |
| Add a missing test case                                | 1 per merged PR | Identify an upstream coverage gap, follow the repository's rules and get the PR merged                                         |
| Write a WSO2 product/feature/problem blog post         | 1 per post      | A published, accurate explanation grounded in reproduced results                                                               |

Tests and documentation in this repository improve this project. They are **not** automatically WSO2 documentation/test PR points. Multiple WSO2 products in one application should not be counted as multiple projects. No upstream PR, blog publication or points approval has happened as part of this build.

## A useful order of work

First finish a narrow WSO2 integration and reproduce the results from a clean checkout. Then write a post about the specific engineering lesson, using your actual trace and code. If you discover a real documentation mistake or missing upstream test while integrating, record the smallest reproduction and check the project's contribution instructions before proposing a fix.

Do not create a low-value PR just to fill a row. A good contribution explains the problem, why the change is correct and how it was checked.

## Suggested article angle

“The API timed out. Why did the customer get two deliveries?”

Explain the difference between a missing response and a failed side effect. Show the baseline ledger, explain the operation key, and show the recovery result. Identify exactly where a verified WSO2 component runs. Discuss what the experiment cannot prove. Keep any unpublished draft labelled as a draft.

## Before adding this to the CV

Be ready to run and explain the scenario without reading a generated script. Explain the idempotency scope, the memory-only provider ledger and why a local experiment is not an exactly-once guarantee. List only integrations that have actually run. Add measured results only when their method and evidence are saved. Review and personalize the writing so it reflects your own understanding.
