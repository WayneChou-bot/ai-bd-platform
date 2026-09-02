-- ICP Suggestion runs were recorded under product_understanding (field test:
-- two "Product Understanding" rows per project). Give the agent its own name.
alter type agent_name add value if not exists 'icp_suggest';
