# Description 

Epic: [AD-1184](https://athian.atlassian.net/browse/AD-1184)

Producers have been asking for more visibility into the financial information as it relates to their interventions and monitoring periods. Additionally, we’d like to make adjustments to the dashboard that will provide more support & better insights to producer users - especially as we add additional protocols to the software that aren’t directly linked to Uplook data.

# Work Items

## Revenue
Modifications to support revenue tracking on the Producer Interventions Dashboard.
- Note: this is the total **PRODUCER** payment for the assets, and **NOT** the full claim amount that the buyer pays.
- This is a running total and will update as assets are sold/claimed, totaling-up values from multiple (or partial) claims as needed. If none of the assets are claimed, this will remain $0.00 -- no projected values.
### Callouts
- Cross reference where else we might use Revenue on a Monitoring Period basis
- To what extend will this roll up to Intervention in the model.
- Maintain proper separation with [[Asset Management]].
- Consider currency units when calculating

![[monitoring-period-revenue.png]]

# Research
Identify what is tracked and available in [[Asset Management]].
# Related
- Improve performance via data model enhancements where practical.
- Combine Intervention modifications with [[Enhanced Protocol Support]] if possible.
