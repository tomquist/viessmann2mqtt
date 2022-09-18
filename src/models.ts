export interface Geolocation {
  latitude: number;
  longitude: number;
  timeZone: string;
}

export interface Address {
  street: string | null;
  houseNumber: string | null;
  zip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  phoneNumber: string | null;
  faxNumber: string | null;
  geolocation: string | Geolocation;
}

export interface Device {
  gatewaySerial: string;
  id: string;
  boilerSerial: string;
  boilerSerialEditor: string;
  bmuSerial: null;
  bmuSerialEditor: null;
  createdAt: string;
  editedAt: string;
  modelId: string;
  status: string;
  deviceType: string;
  roles: string[];
}

export interface Gateway {
  serial: string;
  version: string;
  firmwareUpdateFailureCounter: 0;
  autoUpdate: false;
  createdAt: string;
  producedAt: string;
  lastStatusChangedAt: string;
  aggregatedStatus: string;
  targetRealm: string;
  devices: Device[];
  gatewayType: string;
  installationId: number;
  registeredAt: string;
  description: string | null;
  otaOngoing: boolean;
}

export interface Installation {
  id: number;
  description: string;
  address: Address;
  gateways: Gateway[];
  aggregatedStatus: string;
}

export interface ViessmannResponse<T> {
  data: T[];
}

export interface StringProperty {
  type: "string";
  value: string;
}

export interface BooleanProperty {
  type: "boolean";
  value: boolean;
}

export interface ArrayProperty {
  type: "array";
  value: any[];
}

export enum Unit {
  TerawattHour = "TerawattHour",
  GigawattHour = "GigawattHour",
  MegawattHour = "MegawattHour",
  KilowattHour = "KilowattHour",
  WattHour = "WattHour",
  Terawatt = "Terawatt",
  Gigawatt = "Gigawatt",
  Megawatt = "Megawatt",
  Kilowatt = "Kilowatt",
  Watt = "Watt",
  Ampere = "Ampere",
  dBm = "dBm",
  Decibar = "Decibar",
  Bar = "Bar",
  Kilometer = "Kilometer",
  Kilogram = "Kilogram",
  CubicMeter = "CubicMeter",
  Liter = "Liter",
  Gallon = "Gallon",
  CubicMeterPerHour = "CubicMeterPerHour",
  LiterPerMinute = "LiterPerMinute",
  GallonPerMinute = "GallonPerMinute",
  Celsius = "Celsius",
  Fahrenheit = "Fahrenheit",
  Percentage = "Percentage",
  KilometersPerHour = "KilometersPerHour",
  MilesPerHour = "MilesPerHour",
  Millimeters = "Millimeters",
  Inches = "Inches",
  KilogramsPerHour = "KilogramsPerHour",
  Days = "Days",
  PartsPerMillion = "PartsPerMillion",
  Empty = "Empty",
}

export interface NumberProperty {
  type: "number";
  value: number;
  unit: Uncapitalize<Unit>;
}

export type Property =
  | StringProperty
  | BooleanProperty
  | ArrayProperty
  | NumberProperty;

export type CommandParameter = {
  type: string;
  required: boolean;
  constraints: any;
};

export interface Command {
  uri: string;
  name: string;
  isExecutable: boolean;
  params: Record<string, CommandParameter>;
}

export interface Feature {
  properties: Record<string, Property>;
  commands: Record<string, Command>;
  apiVersion: number;
  uri: string;
  gatewayId: string;
  feature: string;
  timestamp: string;
  isEnabled: boolean;
  isReady: boolean;
  deviceId: string;
}

export type FeatureResponse = ViessmannResponse<Feature>;
export type InstallationsResponse = ViessmannResponse<Installation>;
