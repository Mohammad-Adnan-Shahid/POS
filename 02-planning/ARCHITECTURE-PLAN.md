# Architecture Plan

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> Scope: specs/001-purchase-request, specs/002-approval-workflow, specs/003-financial-engine. Canonical plan: SOFTWARE-PLANNING.md.

---

## 1. High-Level Architecture

```
+------------------------------------------------------------------+
|                     React.js Frontend (SPA)                       |
|  - Dashboard, Forms, Approval Screens                            |
|  - No authorization logic; relies entirely on backend enforcement |
+------------------------------------------------------------------+
                              |
                              | HTTPS (JSON payloads)
                              v
+------------------------------------------------------------------+
|                   FastAPI REST API Layer                          |
|  - Request routing, validation, serialization                    |
|  - JWT authentication extraction                                 |
|  - Tenant context resolution                                     |
|  - Rate limiting                                                 |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|              Application / Business Services Layer               |
|  - Authentication Service    - Notification Service              |
|  - Authorization (RBAC)      - Audit Service                     |
|  - Procurement Service       - Dashboard Service                 |
|  - Approval Service          - Duplicate Detection Service       |
|  - Financial Services:                                            |
|    - Commitment Service     - Budget Service                     |
|    - Financial Validation Service                                |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|              Data Access / Repository Layer                       |
|  - SQLAlchemy ORM (async)                                        |
|  - Tenant-scoped query filters                                   |
|  - Optimistic locking                                            |
|  - Transaction management                                        |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                   PostgreSQL Database                             |
|  - Shared schema, organization_id isolation                      |
|  - UUID primary keys                                             |
|  - Database-level constraints                                    |
|  - Comprehensive indexing                                        |
+------------------------------------------------------------------+
```

> Deferred modules (removed from the layer diagram, retained in the roadmap): Platform Service, Subscription Service, Module Entitlement Service, Supplier Service, Receiving Service, Invoice Service, Matching Service, Liability Service, Payment Service, Accounts Payable Service, Cash Flow Service, Accounting Service, Report/Export Service.

---

## 2. Layer Responsibilities

### 2.1 Frontend Layer (React.js)

**Responsibilities:**
- User interface rendering
- Form input and client-side validation (cosmetic only)
- API communication via HTTP client
- State management for UI state
- Routing and navigation

**Not Responsible For:**
- Authorization decisions (backend is the single source of truth)
- Business logic execution
- Financial calculations used for security decisions
- Data filtering by tenant (backend enforces this)

### 2.2 API Layer (FastAPI)

**Responsibilities:**
- HTTP request routing and method matching
- Request body/query parameter validation (Pydantic models)
- JWT token extraction and validation
- Tenant context resolution from JWT claims
- Delegation to appropriate service
- Response serialization
- Error response formatting
- Rate limiting enforcement
- CORS configuration
- API documentation (OpenAPI/Swagger)

**Not Responsible For:**
- Business logic (delegates to services)
- Direct database queries (delegates to repository layer)

### 2.3 Authentication Service

**Responsibilities:**
- User login and credential verification
- JWT token generation and refresh
- Password hashing and verification
- Session management
- Multi-organization user context switching
- Token revocation

### 2.4 Authorization Service (RBAC)

**Responsibilities:**
- Permission evaluation for the current user in the current tenant context
- Role resolution
- Approval authority limit checking
- Separation of duties enforcement
- Scope checking (branch, department, amount)
- Approval workflow step assignment checks (P2.6)

**Enforcement Points:**
- API middleware (full authorization chain: auth → tenant → RBAC → scope)
- Service layer (business operation permission check)
- Repository layer (data-access level filtering)

### 2.5 Business Services Layer (In-Scope)

| Service | Domain | Key Responsibilities |
|---|---|---|
| Procurement Service | Purchase Requests | Request lifecycle, item management, budget linking, PO conversion (P3.1) |
| Approval Service | Approvals | Workflow routing, authority checking, exception handling, hold/resume (P2.4) |
| Duplicate Detection Service | Duplicate Prevention | Cross-entity duplicate scanning, tolerance configuration, override handling |
| Commitment Service | Financial Commitments | Commitment create/release (P1.3, P1.4), available funds calculation |
| Budget Service | Budgets | Allocation management, utilization tracking, transfer processing |
| Financial Validation Service | Pre-Approval Checks | Aggregate financial impact calculation, risk level determination |
| Current Funds Service | Funds | Manual current-funds entry with mandatory reason and audit (P1.2) |
| Dashboard Service | Dashboard | Financial status, pending approvals, budget utilization (P3.2) |

### 2.6 Notification Service

**Responsibilities:**
- Event-driven notification dispatch
- Channel management (in-app, email, WhatsApp)
- User preference filtering
- Tenant isolation of notification content
- Escalation for unacknowledged critical alerts

### 2.7 Audit Service

**Responsibilities:**
- Append-only audit log writing
- Cross-cutting concern observation (listens to events from all services)
- Audit trail querying (read-only, tenant-scoped)

### 2.8 Data Access / Repository Layer

**Responsibilities:**
- Database connection management
- ORM model definitions
- Tenant-scoped query construction (mandatory `organization_id` filter)
- Optimistic locking enforcement
- Transaction management
- Query optimization and indexing

---

## 3. Domain Event Architecture

Within the modular monolith, modules communicate via domain events to maintain loose coupling:

### Event Types (In-Scope)

| Event | Producer | Consumers |
|---|---|---|
| `PurchaseRequestSubmitted` | Procurement Service | Approval Service, Duplicate Detection, Notification |
| `PurchaseRequestRecalled` | Procurement Service | Approval Service, Notification |
| `ApprovalDecisionMade` | Approval Service | Procurement Service, Commitment Service, Notification |
| `PurchaseOrderCreated` | Procurement Service | Commitment Service, Notification |
| `CommitmentReleased` | Commitment Service | Financial Validation, Notification |
| `BudgetThresholdBreached` | Budget Service | Notification, Approval Service |
| `FinancialPositionCritical` | Financial Validation | Notification, Approval Service |

> Deferred events (retained in roadmap): GoodsReceived, InvoiceCreated, ThreeWayMatchCompleted, PaymentProcessed, PaymentReversed, LiabilityOccurrenceGenerated, SubscriptionStateChanged.

### Event Implementation

- Events are Python dataclass objects published to an in-process event bus
- Consumers are registered as event handlers
- Events include tenant context (`organization_id`)
- Event handling is synchronous within a database transaction for consistency
- Future migration to async message queue (e.g., Redis, RabbitMQ) is architecturally supported

---

## 4. Service Interaction Patterns

### 4.1 Purchase Request Submission Flow

```
User submits Purchase Request
        |
        v
API Layer: Validate input, extract tenant context
        |
        v
Procurement Service: Create/update request
        |
        v
Duplicate Detection Service: Check for duplicates
        |  (if duplicate found: return warning, require override)
        v
Notification Service: Notify relevant approvers
        |
        v
Audit Service: Log submission event
```

### 4.2 Approval Flow (In-Scope)

```
Approver acts on request
        |
        v
API Layer: Validate input, extract tenant context
        |
        v
Authorization Service: Check approver has permission + authority + step assignment (P2.6)
        |
        v
Approval Service: Route to next step or complete
        |
        v
Financial Validation Service: Calculate financial impact
        |  (Available Funds, Budget, Commitments)
        v
Commitment Service: Create commitment if approved (idempotent, P1.3)
        |
        v
Notification Service: Notify requester and next approver
        |
        v
Audit Service: Log approval decision with financial snapshot
```

### 4.3 PO Conversion Flow (P3.1)

```
Officer converts approved PR to PO
        |
        v
API Layer: Validate input, extract tenant context
        |
        v
Procurement Service: Create PO copying items, link to PR, assign supplier
        |
        v
Commitment Service: Confirm commitment exists for the request
        |
        v
Notification Service: Notify relevant parties
        |
        v
Audit Service: Log PO creation
```

---

## 5. Error Handling Strategy

### Error Response Structure

```json
{
  "error": {
    "code": "INSUFFICIENT_AUTHORITY",
    "message": "Your approval authority of $5,000 is insufficient for this $12,000 request.",
    "details": {
      "required_authority": 12000,
      "current_authority": 5000
    }
  }
}
```

### Error Categories

| Category | Examples | HTTP Status |
|---|---|---|
| Authentication | Invalid token, expired session | 401 |
| Authorization | Insufficient permissions, authority exceeded | 403 |
| Validation | Missing required field, invalid amount | 422 |
| Business Rule | Duplicate request, over-budget, insufficient funds | 400 |
| Conflict | Concurrent modification, race condition | 409 |
| Not Found | Entity does not exist or tenant mismatch | 404 |
| System | Database error, external service failure | 500 |

---

## 6. Transaction Management

### Database Transactions

- Each financial operation (approval, commitment creation, release, fund entry) runs in a single database transaction
- If any step fails, the entire operation rolls back
- Read operations use database-level read consistency
- Write operations use optimistic locking with version columns

### Cross-Service Consistency

- Domain events are published within the same transaction as the producing operation
- Event handlers execute synchronously within the same transaction
- If an event handler fails, the entire transaction rolls back
- This ensures consistency without distributed transactions

---

## 7. Caching Strategy

| Data | Cache Location | Invalidation |
|---|---|---|
| User permissions | In-memory (per request) | Request-scoped (no caching across requests) |
| Role definitions | In-memory (per request) | Request-scoped |
| Organization settings | In-memory (per request) | Request-scoped |
| Dashboard aggregates | Redis (optional) | Time-based or event-driven |
| Reference data (categories, currencies) | In-memory | Application startup |

**Principle:** Financial data is never cached across requests. Available funds, budgets, and commitments are always computed from live data.

---

## 8. Deployment Architecture

### Initial Deployment (MVP)

```
+------------------+     +------------------+
|   React.js SPA   |     |   React.js SPA   |
|   (CDN/Vercel)   |     |   (CDN/Vercel)   |
+------------------+     +------------------+
         |                        |
         +----------+-------------+
                    |
                    v
+------------------------------------------+
|         FastAPI Application              |
|    (Single Process / Gunicorn)           |
|    - All business services               |
|    - In-process event bus                |
|    - In-process background scheduler     |
+------------------------------------------+
                    |
                    v
+------------------------------------------+
|           PostgreSQL Database            |
|    (Single instance, managed)            |
+------------------------------------------+
```

### Scaled Deployment (Future)

```
+------------------+     +------------------+
|   React.js SPA   |     |   React.js SPA   |
+------------------+     +------------------+
         |
         v
+------------------------------------------+
|           Load Balancer                  |
+------------------------------------------+
         |
    +----+----+
    |         |
    v         v
+--------+ +--------+
| FastAPI| | FastAPI|   (Multiple instances)
+--------+ +--------+
    |         |
    +----+----+
         |
    +----+----+
    |         |
    v         v
+--------+ +--------+
|Postgres| |Postgres|   (Primary + Replica)
+--------+ +--------+
         |
         v
+------------------------------------------+
|       Redis (Optional)                   |
|   - Background job queue                |
|   - Dashboard cache                     |
|   - Rate limiting                       |
+------------------------------------------+
```

---

## 9. Technology Stack Summary

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React.js | Single-page application UI |
| API Framework | FastAPI (Python) | REST API, async support, auto-documentation |
| ORM | SQLAlchemy (async) | Database abstraction, query building |
| Validation | Pydantic | Request/response validation |
| Authentication | JWT (python-jose) | Stateless token-based auth |
| Password Hashing | bcrypt/argon2 | Secure credential storage |
| Database | PostgreSQL | Primary data store |
| Background Jobs | APScheduler / custom | In-process task scheduling |
| Testing | pytest | Unit and integration tests |
| API Docs | OpenAPI (auto from FastAPI) | API documentation |

---

## 10. Module Boundary Rules

1. **No circular dependencies** between services. If Service A depends on Service B, Service B must not depend on Service A.
2. **Services communicate via events**, not direct function calls across domain boundaries.
3. **Each service owns its data models**. Cross-domain data access goes through the owning service's public interface.
4. **Financial services are the most critical** and must be the most heavily tested.
5. **The repository layer is shared** but each service only queries its own tables through its own repository.

---

*This document defines the high-level architecture. See individual planning documents for detailed module-specific architecture.*