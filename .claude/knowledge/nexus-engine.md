# The Nexus Engine - Knowledge Base
# Project-specific knowledge that persists across sessions

## Architecture Decisions

### Why Go + Python Hybrid?
**Decision:** Use Go for PBS (high-performance auction) and Python for IDR (ML-powered routing)
**Rationale:** 
- Go: Sub-100ms latency requirements, high concurrency, Prebid ecosystem
- Python: ML libraries (scikit-learn, pandas), faster iteration on algorithms
**Date:** 2024-Q3
**Status:** Confirmed

### Why TimescaleDB over ClickHouse?
**Decision:** Use TimescaleDB for analytics
**Rationale:**
- PostgreSQL compatibility (easier ops)
- Good enough performance for current scale
- Simpler than ClickHouse for our team size
**Date:** 2024-Q4
**Status:** May revisit at 100M+ requests/day

### Multi-tenant Single Deployment
**Decision:** One deployment serves all publishers
**Rationale:**
- Simpler ops (one thing to monitor)
- Cost efficient
- Publisher isolation via config, not infra
**Gotcha:** Must be careful with noisy neighbor effects
**Date:** 2024-Q3
**Status:** Confirmed

---

## Gotchas & Pitfalls

### Redis Connection Pooling
**Problem:** Connection exhaustion under load
**Solution:** Always use connection pooling, max 50 connections per instance
**Files:** `src/idr/redis_client.py`

### PBS Bidder Timeouts
**Problem:** Default timeout too aggressive for some SSPs
**Solution:** Per-bidder timeout config, default 150ms, some need 300ms
**Files:** `pbs/internal/config/bidders.go`

### GDPR Consent String Parsing
**Problem:** TCF v2.2 consent strings can be malformed
**Solution:** Always wrap in try/catch, default to no-consent on parse failure
**Files:** `src/idr/privacy/consent.py`

---

## Conventions

### API Versioning
- All endpoints prefixed with `/v1/`
- Breaking changes = new version
- Old versions supported for 6 months

### Error Responses
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Human readable message",
    "details": {}
  }
}
```

### Logging
- Structured JSON logs
- Always include `request_id`
- Levels: DEBUG, INFO, WARN, ERROR
- No PII in logs

### Config Hierarchy
1. Environment variables (highest priority)
2. Publisher-specific YAML
3. Default config YAML

---

## Key Contacts

### Technical
- IDR/Python: [owner]
- PBS/Go: [owner]
- Infrastructure: [owner]

### Business
- Publisher Relations: [contact]
- SSP Partnerships: [contact]

---

## External Dependencies

### SSPs Integrated
- Magnite (formerly Rubicon)
- PubMatic
- OpenX
- Index Exchange
- AppNexus/Xandr

### Critical Services
- Redis: Session cache, rate limiting
- TimescaleDB: Analytics, reporting
- Prometheus: Metrics
- Grafana: Dashboards

---

## Runbooks

### High Latency Alert
1. Check Grafana dashboard: `Nexus Engine / Latency`
2. Look for specific bidder timeouts
3. Check Redis connection count
4. If single bidder: consider temporary disable
5. If global: check TimescaleDB slow queries

### Publisher Onboarding
1. Create publisher config in `config/publishers/`
2. Set up bidder selection rules
3. Configure floor prices (start conservative)
4. Enable 1% traffic initially
5. Monitor for 24 hours before scaling

---

## Changelog

### 2024-12-20
- Added multi-tenant architecture decision
- Documented Redis connection gotcha

### 2024-12-15
- Initial knowledge base created
