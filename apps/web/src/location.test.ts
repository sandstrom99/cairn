import { describe, expect, it } from "vitest";
import { titleOf } from "./App.tsx";
import { isOurs, routeOf } from "./location.ts";

describe("routeOf", () => {
  it("names the three fixed pages", () => {
    expect(routeOf("/")).toEqual({ page: "overview" });
    expect(routeOf("/issues")).toEqual({ page: "issues" });
    expect(routeOf("/log/")).toEqual({ page: "log" });
  });

  it("reads anything shaped like an id as that id's page, whatever table it is in", () => {
    expect(routeOf("/app-14")).toEqual({ page: "item", id: "app-14" });
    expect(routeOf("/ep-3")).toEqual({ page: "item", id: "ep-3" });
    expect(routeOf("/bl-2")).toEqual({ page: "item", id: "bl-2" });
  });

  it("knows a path that is neither", () => {
    expect(routeOf("/app")).toBeUndefined();
    expect(routeOf("/app-14/edit")).toBeUndefined();
    expect(routeOf("/App-14")).toBeUndefined();
  });

  it("reads /projects as the projects page, and a slug under it as that project's page", () => {
    expect(routeOf("/projects")).toEqual({ page: "projects" });
    expect(routeOf("/projects/")).toEqual({ page: "projects" });
    expect(routeOf("/projects/cn")).toEqual({ page: "project", slug: "cn" });
  });

  it("knows a path under /projects that no slug could be", () => {
    expect(routeOf("/projects/Cn")).toBeUndefined();
    expect(routeOf("/projects/cn/x")).toBeUndefined();
    expect(routeOf("/projects/ep-3")).toBeUndefined();
    expect(routeOf(`/projects/${"a".repeat(17)}`)).toBeUndefined();
  });
});

describe("isOurs", () => {
  const plain = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
  };
  const here = { origin: "http://cairn.test", target: "" };

  it("takes a plain click on a link to this origin", () => {
    expect(isOurs(plain, here, "http://cairn.test")).toBe(true);
  });

  it("leaves the browser a modified click, another origin, a new tab and a download", () => {
    expect(isOurs({ ...plain, metaKey: true }, here, "http://cairn.test")).toBe(false);
    expect(isOurs({ ...plain, button: 1 }, here, "http://cairn.test")).toBe(false);
    expect(isOurs(plain, { ...here, origin: "https://convex.dev" }, "http://cairn.test")).toBe(
      false,
    );
    expect(isOurs(plain, { ...here, target: "_blank" }, "http://cairn.test")).toBe(false);
    expect(isOurs(plain, { ...here, download: true }, "http://cairn.test")).toBe(false);
  });
});

describe("titleOf", () => {
  it("names the page, then the deployment", () => {
    expect(titleOf(routeOf("/issues"), undefined, "driftwood")).toBe("Issues · driftwood");
    expect(titleOf(routeOf("/log"), undefined, "driftwood")).toBe("Log · driftwood");
    expect(titleOf(routeOf("/cn-14"), 'cn-14 "fix connection retry"', "driftwood")).toBe(
      'cn-14 "fix connection retry" · driftwood',
    );
    expect(titleOf(routeOf("/projects"), undefined, "driftwood")).toBe("Projects · driftwood");
    expect(titleOf(routeOf("/projects/cn"), undefined, "driftwood")).toBe("cn · driftwood");
    expect(titleOf(routeOf("/"), undefined, "driftwood")).toBe("driftwood");
  });
});
