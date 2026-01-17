# Examples

Comparison of auth integration patterns across frameworks:

|                   | TanStack+SF    | TanStack+REST | Next+SF      | Next+REST    |
| ----------------- | -------------- | ------------- | ------------ | ------------ |
| Core auth         | ✓              | ✓             | ✓            | ✓            |
| Validators (p.\*) | ✓              | ✓             | ✓            | ✓            |
| Session transport | TanStack       | Web std       | Next         | Web std      |
| Handler wrapper   | createServerFn | Request→Resp  | "use server" | Request→Resp |
| Typed client      | (direct)       | fetch         | (direct)     | fetch        |

- **SF** = Server Functions (framework-provided RPC)
- **REST** = Standard HTTP endpoints with typed client
