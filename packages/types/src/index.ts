export type AppEnvironment = "development" | "test" | "production";

export type HealthStatus = {
  status: "ok";
  service: string;
  timestamp: string;
};
