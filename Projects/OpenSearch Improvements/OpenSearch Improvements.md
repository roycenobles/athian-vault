OpenSearch is working well for our purposes, but it has several noteworthy shortcomings that must be addressed:
- Costs far too much to operate
- Can only search one type of data currently
- Very limited tooling to keep up to date
- UX is not notified when updated

# I can do better
- We don't need a giant search tool
- Build something leveraging EFS and an indexing library
- Expose and account for:
	- Access Control
	- Multi-Index and mixed usecases
	- Reindex functionality
	- Lambda operation (lightning-fast performance is not necessary)
	- Scaling to low-millions of documents (small to mid)
	- Conform roughly to ElasticSearch APIs
	- Consumable as L3 construct