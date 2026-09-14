Reserved core modules (Master Spec §132). **No product logic in Sprint 0.**

| Module                                                     | Sprint  |
| ---------------------------------------------------------- | ------- |
| auth, users                                                | S2      |
| geo                                                        | S3      |
| zone-planner                                               | S4      |
| zones                                                      | S5      |
| addresses, join flow                                       | S6      |
| households                                                 | S7      |
| providers, locations, verification                         | S8–S9   |
| catalog, offerings, options                                | S10     |
| availability                                               | S11     |
| search, map                                                | S12     |
| reviews, favorites                                         | S13     |
| discovery                                                  | S14     |
| food flows                                                 | S15–S18 |
| orders                                                     | S19     |
| payments                                                   | S20     |
| runners                                                    | S21     |
| fulfillment, routing                                       | S22–S23 |
| web clients                                                | S24–S26 |
| admin, zone-planner UI                                     | S27     |
| messaging, notifications                                   | S28     |
| laundry, home services, beauty, education, pet, classified | S29–S33 |
| analytics, hardening                                       | S34     |

Core modules must not import vendor SDKs. See `.cursor/rules/picki-adapters.mdc`.
