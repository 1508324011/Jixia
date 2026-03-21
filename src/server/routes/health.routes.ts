export interface HealthStatus {
  service: 'jixia-server';
  status: 'ok';
}

export interface HealthRoutes {
  getHealth(): HealthStatus;
}

export function createHealthRoutes(): HealthRoutes {
  return {
    getHealth(): HealthStatus {
      return {
        service: 'jixia-server',
        status: 'ok',
      };
    },
  };
}
