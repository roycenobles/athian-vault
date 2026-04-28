# Overview
Creates a foundation on which we can easily launch and manage protocols.

[[2025-09|2025-09 SCRUM 0]]

![[protocol-support.drawio.png|500]]
## Objectives
- Able to quickly launch new protocols in the system.
- Support Quantification of Monitoring Periods via hosted calculators.
- Able to Launch pilots with minimal information and refine through early versions.
- Support low-transformation analytics to answer common lifecycle and funding questions.
	- How many assets have been created for a producer?
	- How many assets have been claimed by a buyer?
## Design Principles
- Treat all interventions as generically as possible in order to scale our ability to manage them.
- Intervention rules, behavior and data are governed (and versioned) by their protocol.
- When a protocol changes (i.e. new components, new data elements), a new version is created and existing interventions respect their original version.
- The Frontend is responsible for presentation and formatting for user consumption.
- The Microservices are responsible for data management and integrity, business rules execution, and authorization.
- Favor asynchronous communication (eventual consistency) where practical to maintain performance and scalability.

# Protocol Enhancements
[[Protocol Enhancements]]
[[AMMP Protocol Definition]]
# Related Services
These services will be modified or created to support this effort.
- [[Interventions]]
- [[Quantifications]]