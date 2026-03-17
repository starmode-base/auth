import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultErrorComponent: (props) => {
      console.error("errorComponent", props);
      return <div>Error (see console for details)</div>;
    },
    defaultNotFoundComponent: (props) => {
      console.error("notFoundComponent", props);
      return <div>Not Found (see console for details)</div>;
    },
  });

  return router;
}
