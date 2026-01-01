export type ConfigCache = {
  cookie: string;
  ADMIN_LIST: string[];
  WL_MEMBERS_LIST: string[];
  CONTAINER_CONTROLLER_LIST: string[];
  bannedUsers: string[];
  status: 'active' | 'sleep' | 'deactivated' | 'maintenance' | (string & {});
  statusMessage: string;
  waitingCookie: boolean;
};
export type PreMapConfig = Map<
  keyof ConfigCache,
  ConfigCache[keyof ConfigCache]
>;
export type MapConfig = Omit<PreMapConfig, 'get' | 'set'> & {
  get: <K extends keyof ConfigCache>(key: K) => ConfigCache[K] | undefined;
  set: <K extends keyof ConfigCache>(
    key: K,
    value: ConfigCache[K]
  ) => MapConfig;
};

export type ActiveUserData = {
  fullnameWithUsername: string;
  id: number | string;
  username?: string;
  logging?: string[];
  lastActive: Date;
};

export type OnTextNumberActionOptions = {
  withMore: boolean;
  showAllSmallPackage: boolean;
  isSubLogCode: boolean;
  isNearToNewLogCode: boolean;
  isTrackingNumber: boolean;
  isNewLogCode: boolean;
  isOldLogCode: boolean;
};
