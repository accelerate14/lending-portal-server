# SDK Filtering Implementation - Limitations & Considerations

## Document Purpose
This document outlines the limitations discovered during the implementation of UiPath TypeScript SDK OData filtering across the FinancialLendingServer project.

---

## 1. Type Safety Gap

### Issue
The UiPath TypeScript SDK v1.1.1 type definitions do not explicitly declare `filter`, `select`, `orderby`, or other OData query parameters in the `EntityGetAllRecordsOptions` interface.

### Current Definition
```typescript
type EntityGetAllRecordsOptions = {
    expansionLevel?: number;
} & PaginationOptions;
```

### Impact
- TypeScript compiler will show errors like: `Object literal may only specify known properties`
- Requires workarounds: either disable type checking or use type assertion

### Workaround Used
While we avoid using `as any` in production JS files, the SDK implementation internally supports these parameters through the `params` field in `RequestSpec`.

### Recommendation
- Report this to UiPath SDK maintainers to update type definitions
- Consider creating a custom interface extending `EntityGetAllRecordsOptions`
- Document the discrepancy between implementation and types

---

## 2. OData Syntax Requirements

### Constraint
All filter expressions must follow strict **OData query language syntax**. Invalid syntax will be silently ignored or rejected by the API server.

### Supported OData Operators
| Operator | Example | Supported |
|----------|---------|-----------|
| `eq` (equal) | `emailAddress eq 'user@example.com'` | ✅ Yes |
| `and` (logical AND) | `status eq 'Active' and isActive eq true` | ✅ Yes |
| `or` (logical OR) | `status eq 'Active' or status eq 'Inactive'` | ⚠️ Untested |
| `startsWith` | `startsWith(name, 'John')` | ⚠️ Untested |
| `endsWith` | `endsWith(email, '@example.com')` | ⚠️ Untested |
| `contains` | `contains(description, 'keyword')` | ⚠️ Untested |
| `gt`, `lt`, `ge`, `le` | `age gt 18` | ⚠️ Untested |
| `not` | `not(status eq 'Deleted')` | ⚠️ Untested |

### Impact
- Developers must validate filter strings before passing to SDK
- No compile-time validation available
- Runtime errors may occur if backend API doesn't support specific operators
- String escaping requirements (e.g., single quotes in values) not clearly documented

### Recommendation
- Create a filter builder utility to validate OData syntax
- Add unit tests for common filter patterns
- Document supported operators per entity

---

## 3. API Server Dependency

### Constraint
Filtering capability depends entirely on whether the **UiPath Data Fabric API endpoint** supports OData query parameters.

### Potential Issues
- Different versions of UiPath may support different operators
- Some UiPath instances may have filtering disabled
- Custom fields might not be filterable
- Performance may degrade with complex filters on large datasets

### Impact
- No way to verify filter support at client level
- Failures may only be discovered in production
- Different behaviors across different UiPath environments

### Recommendation
- Test filters thoroughly in staging environment before deploying to production
- Implement fallback logic that fetches all records if filtering fails
- Monitor API response times with complex filters

---

## 4. Undocumented Feature

### Issue
The OData filtering capability in the UiPath TypeScript SDK is not mentioned in:
- Official README documentation
- TypeScript type definitions comments
- Public API examples
- Any official support materials

### Why This Matters
- Feature could be deprecated or removed in future SDK versions without notice
- No guarantee of backward compatibility
- Limited community support or examples available
- Bug reports may be dismissed as "unsupported usage"

### Impact
- Code using this feature is at risk if SDK maintainers decide to restrict it
- Harder to find solutions when issues arise
- Team members may not understand why this pattern is used

### Recommendation
- Document this implementation pattern internally
- Regularly check UiPath SDK release notes for changes
- Maintain a fallback implementation using `getAllRecords()` with client-side filtering
- Plan for migration if SDK introduces official filter support later

---

## 5. Performance vs Coverage Trade-off

### Scenario Analysis

#### Original Approach (Current - In-Memory Filtering)
```javascript
const records = await borrowerEntity.getAllRecords();
const user = records.items.find(u => u.emailAddress === email);
```

**Pros:**
- Works consistently regardless of API support
- Full control over filtering logic
- Type-safe (no OData syntax needed)

**Cons:**
- Network: Transfers ALL records (potentially 10,000+)
- Memory: Loads entire dataset into application memory
- CPU: JavaScript filtering slower than database-level filtering
- Scalability: Degrades as dataset grows

#### New Approach (SDK OData Filtering)
```javascript
const records = await borrowerEntity.getAllRecords({
    filter: `emailAddress eq '${email}'`
});
```

**Pros:**
- Network: Transfers only matching records
- Memory: Minimal footprint
- CPU: Database-level filtering (optimized)
- Scalability: Consistent performance as dataset grows

**Cons:**
- Requires API server support
- OData syntax must be correct
- Complex filters may not be supported
- Cannot use arbitrary JavaScript logic in filters

### Performance Impact Estimate
- **Small datasets (< 100 records):** Negligible difference
- **Medium datasets (100-10,000 records):** 5-20x improvement
- **Large datasets (> 10,000 records):** 50-200x improvement + reduced memory usage

---

## 6. Current Implementation Limitations

### In borrowerAuth.controller.js

**Login Filter:**
```javascript
filter: `emailAddress eq '${email}' and isActive eq true`
```
- ✅ Works: Exact string matching + boolean AND
- ⚠️ Risk: No validation of `email` input - could break OData syntax if email contains special characters

**Register Pre-Check Filter:**
```javascript
filter: `emailAddress eq '${email}'`
```
- ✅ Works: Exact string matching
- ⚠️ Risk: Same as above

### Potential Failure Cases
1. **Email with special characters:**
   ```
   Input: user's@example.com
   Filter: emailAddress eq 'user's@example.com'  // ❌ FAILS - unescaped quote
   ```

2. **Email with backslash:**
   ```
   Input: user\admin@example.com
   Filter: emailAddress eq 'user\admin@example.com'  // ❌ FAILS - escape sequence
   ```

---

## 7. Recommendations for Future Work

### Short-term (Immediate)
1. Add input validation to escape special characters in filter values
2. Create filter builder utility with proper OData escaping
3. Add error logging for filter failures

### Medium-term (1-2 months)
1. Test all filter operators against actual UiPath instance
2. Document supported operators per entity type
3. Create unit tests for filter edge cases
4. Implement fallback to in-memory filtering if API fails

### Long-term (3-6 months)
1. Monitor UiPath SDK changelog for official filter support
2. Consider using query builder library if available
3. Evaluate other ORM solutions that better support complex queries
4. Implement database-level caching for frequently used queries

---

## 8. Testing Checklist

- [ ] Test login with normal email
- [ ] Test login with email containing special characters
- [ ] Test login with non-existent email
- [ ] Test register with duplicate email
- [ ] Test register with email containing special characters
- [ ] Monitor API response times with various filter complexities
- [ ] Test with large datasets (10,000+ records)
- [ ] Verify filter behavior across different UiPath environments

---

## 9. References

- UiPath TypeScript SDK: `@uipath/uipath-typescript@1.1.1`
- OData Query Language: https://www.odata.org/
- Implementation Files:
  - `controller/borrower/Auth/borrowerAuth.controller.js` - Line 16-26 (login filter)
  - `controller/borrower/Auth/borrowerAuth.controller.js` - Line 73-76 (register filter)

---

**Document Last Updated:** April 5, 2026  
**Author:** Implementation Team  
**Status:** Active
