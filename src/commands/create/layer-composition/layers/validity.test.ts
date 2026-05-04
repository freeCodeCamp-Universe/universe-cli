import databaseJson from "../layers/database.json" with { type: "json" };
import frameworkJson from "../layers/framework.json" with { type: "json" };
import packageManagersJson from "../layers/package-manager.json" with { type: "json" };
import runtimeJson from "../layers/runtime.json" with { type: "json" };
import labelsJson from "../labels.json" with { type: "json" };
import serviceJson from "../layers/service.json" with { type: "json" };

describe("runtime layers", () => {
  it("should have a 'framework' array referencing specific frameworks", () => {
    const runtimes = Object.values(runtimeJson);
    const runtimeFrameworks = runtimes.flatMap((runtime) => runtime.frameworks);
    const frameworkNames = Object.keys(frameworkJson);

    runtimeFrameworks.forEach((framework: string) => {
      expect(frameworkNames).toContain(framework);
    });
  });

  it("should have a 'packageManagers' array referencing specific package managers", () => {
    const runtimes = Object.values(runtimeJson);
    const runtimePackageManagers = runtimes.flatMap((runtime) => runtime.packageManagers);
    const packageManagerNames = Object.keys(packageManagersJson);

    runtimePackageManagers.forEach((packageManager: string) => {
      expect(packageManagerNames).toContain(packageManager);
    });
  });

  it("should have a 'databases' array referencing specific databases", () => {
    const runtimes = Object.values(runtimeJson);
    const runtimeDatabases = runtimes.flatMap((runtime) => runtime.databases);
    const databaseNames = Object.keys(databaseJson);

    runtimeDatabases.forEach((database: string) => {
      expect(databaseNames).toContain(database);
    });
  });

  it("should have a 'services' array referencing specific services", () => {
    const runtimes = Object.values(runtimeJson);
    const runtimeServices = runtimes.flatMap((runtime) => runtime.services);
    const serviceNames = Object.keys(serviceJson);

    runtimeServices.forEach((service: string) => {
      expect(serviceNames).toContain(service);
    });
  });
});

describe("framework layers", () => {
  it("each framework should have a corresponding runtime", () => {
    const frameworks = Object.keys(frameworkJson);
    const runtimes = Object.values(runtimeJson);
    const runtimeFrameworks = runtimes.flatMap((runtime) => runtime.frameworks);

    frameworks.forEach((framework) => {
      expect(runtimeFrameworks).toContain(framework);
    });
  });
});

describe("package manager layers", () => {
  it("each package manager should have a corresponding runtime", () => {
    const packageManagers = Object.keys(packageManagersJson);
    const runtimes = Object.values(runtimeJson);
    const runtimePackageManagers = runtimes.flatMap((runtime) => runtime.packageManagers);

    packageManagers.forEach((packageManager) => {
      expect(runtimePackageManagers).toContain(packageManager);
    });
  });
});

describe("database layers", () => {
  it("each database should have a corresponding runtime", () => {
    const databases = Object.keys(databaseJson);
    const runtimes = Object.values(runtimeJson);
    const runtimeDatabases = runtimes.flatMap((runtime) => runtime.databases);

    databases.forEach((database) => {
      expect(runtimeDatabases).toContain(database);
    });
  });
});

describe("service layers", () => {
  it("each service should have a corresponding runtime", () => {
    const services = Object.keys(serviceJson);
    const runtimes = Object.values(runtimeJson);
    const runtimeServices = runtimes.flatMap((runtime) => runtime.services);

    services.forEach((service) => {
      expect(runtimeServices).toContain(service);
    });
  });
});

describe("labels", () => {
  it("should have a label for each runtime", () => {
    const runtimes = Object.keys(runtimeJson);
    const labels = Object.keys(labelsJson.runtime);

    runtimes.forEach((runtime) => {
      expect(labels).toContain(runtime);
    });
  });

  it("should have a label for each framework", () => {
    const frameworks = Object.keys(frameworkJson);
    const labels = Object.keys(labelsJson.framework);

    frameworks.forEach((framework) => {
      expect(labels).toContain(framework);
    });
  });

  it("should have a label for each package manager", () => {
    const packageManagers = Object.keys(packageManagersJson);
    const labels = Object.keys(labelsJson.packageManager);

    packageManagers.forEach((packageManager) => {
      expect(labels).toContain(packageManager);
    });
  });

  it("should have a label for each database", () => {
    const databases = Object.keys(databaseJson);
    const labels = Object.keys(labelsJson.database);

    databases.forEach((database) => {
      expect(labels).toContain(database);
    });
  });

  it("should have a label for each service", () => {
    const services = Object.keys(labelsJson.service);
    const labels = Object.keys(labelsJson.service);

    services.forEach((service) => {
      expect(labels).toContain(service);
    });
  });

  it("should not have unused labels", () => {
    const runtimes = Object.keys(runtimeJson);
    const frameworks = Object.keys(frameworkJson);
    const packageManagers = Object.keys(packageManagersJson);
    const databases = Object.keys(databaseJson);
    const services = Object.keys(serviceJson);

    const runtimeLabels = Object.keys(labelsJson.runtime);
    const frameworkLabels = Object.keys(labelsJson.framework);
    const packageManagerLabels = Object.keys(labelsJson.packageManager);
    const databaseLabels = Object.keys(labelsJson.database);
    const serviceLabels = Object.keys(labelsJson.service);

    runtimeLabels.forEach((label) => {
      expect(runtimes).toContain(label);
    });

    frameworkLabels.forEach((label) => {
      expect(frameworks).toContain(label);
    });

    packageManagerLabels.forEach((label) => {
      expect(packageManagers).toContain(label);
    });

    databaseLabels.forEach((label) => {
      expect(databases).toContain(label);
    });

    serviceLabels.forEach((label) => {
      expect(services).toContain(label);
    });
  });
});
