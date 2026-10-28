# Acme Technologies Enterprise Operations & Engineering Handbook

## 1. Remote Work & Core Hours Policy
Acme Technologies operates on a hybrid-first model. All full-time employees are expected to be available for synchronous team collaboration during core working hours from 10:00 AM to 4:00 PM Eastern Standard Time (EST). 
Employees can work remotely up to 3 days per week without prior executive authorization. Working remotely for more than 3 consecutive weeks requires written sign-off from your department Vice President.

## 2. Employee Stock Option Plan (ESOP) Vesting
All standard equity grants for permanent engineering and product employees follow a 4-year vesting schedule with a mandatory 1-year cliff:
- Year 1 (Cliff): 25% of total granted stock options vest exactly on the 12-month anniversary of the employee's hire date.
- Years 2 through 4: The remaining 75% vests in equal monthly increments of 2.083% at the end of each completed calendar month.
- Accelerated Vesting: In the event of a Change of Control (acquisition or merger), all unvested options are subject to a double-trigger acceleration clause requiring both acquisition and termination without cause within 12 months.

## 3. IT Infrastructure & Database Connection Architecture
Production database clusters run on Neon PostgreSQL 18.6 with pgvector 0.8.6. 
- Connection Pooling: Every microservice must connect through PgBouncer connection pooler in transaction mode. Direct connections to port 5432 are strictly forbidden and blocked by AWS Security Group rules.
- Max Connections: The default connection pool limit per tenant pod is set to 25 connections with an idle timeout of 30 seconds.
- Vector Indexing: All 1536-dimensional embeddings must use the HNSW index with m=16 and ef_construction=64 using the cosine distance operator (<=>).

## 4. Incident Escalation & Executive Contacts
For critical P1 production outages or infrastructure security vulnerabilities, contact the Site Reliability Engineering on-call lead immediately at sre-emergency@acme.com or call the emergency escalation hotline at +1 (555) 019-2834. Non-urgent IT support requests should be filed at helpdesk@acme.com.
