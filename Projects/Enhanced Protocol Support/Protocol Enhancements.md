# Components
- What about verification status (per component)?
- What about new vs old values (chips)?
- What about comments?
# Json Sample
## Component Dtos
```typescript
// The id and name of this ComponentDto will be the id and name of the Protocol Component.
export type ComponentDto<T> = {
	id: string;
	name: string;
	created: string;
	updated: string;
	status: ComponentComplianceStatus;
	data: T;
};

export type GenericComponent = ComponentDto<unknown>;
export type StringComponent = ComponentDto<string>;
export type NumberComponent = ComponentDto<number>;

export type DataValue<T> = {
	value: T;
	previous: T;
};
export type DataByEnum<E extends string | number, T> = { [key in E]?: DataValue<T> };
export type DemographicData<T> = DataByEnum<Demographics, T>;
```

## Component Examples
### Diet Data
```typescript

export type DietData = {
	ashPercent: DemographicData<number>;
	crudeProteinPercent: DemographicData<number>;
	dePercent: DemographicData<number>;
	dryMatterKg: DemographicData<number>;
	grainPercent: DemographicData<number>;
};
export type DietDataComponent = ComponentDto<DietData>;
export const DietDataComponentDtoExample: DietDataComponent = {
	id: "0cb0dd2c-e35c-4234-8799-7158dae8cdf6",
	name: "Diet Data",
	created: "",
	updated: "",
	status: ComponentComplianceStatus.Inconclusive,
	data: {
		ashPercent: {
			[Demographics.Dry]: { value: 0.04, previous: 0.04 }
		},
		crudeProteinPercent: {
			[Demographics.Dry]: { value: 0.1534, previous: 0.1534 }
		},
		dePercent: {
			[Demographics.Dry]: { value: 0.7563, previous: 0.7563 }
		},
		dryMatterKg: {
			[Demographics.Dry]: { value: 29, previous: 27 }
		},
		grainPercent: {
			[Demographics.Dry]: { value: 0.85, previous: 0.85 }
		}
	}
};
```
### Fuel
```typescript
export type FuelTypeData<T> = DataByEnum<FuelType, T>;
export type NumberFuelTypeData = FuelTypeData<number>;
export type FuelData = {
	systems: NumberFuelTypeData;
};
export type FuelDataComponent = ComponentDto<FuelData>;
export const FuelDataComponentDtoExample: FuelDataComponent = {
	id: "89b5bf05-9342-4bc6-8b72-fa07344ee52f",
	name: "Fuel",
	created: "",
	updated: "",
	status: ComponentComplianceStatus.Confirmed,
	data: {
		systems: {
			// todo: verify this holds up with add/remove
			[FuelType.Propane]: { value: 306, previous: 304 }
		}
	}
};
```

### Implementation
```typescript
export type ImplementationData = {
	headCount: DemographicData<number>;
};
export type ImplementationComponent = ComponentDto<ImplementationData>;
export const ImplementationDtoExample: ImplementationComponent = {
	id: "4da62ff3-0c2d-49ac-801a-d159e05bee2f",
	name: "Implementation",
	created: "",
	updated: "",
	status: ComponentComplianceStatus.Confirmed,
	data: {
		headCount: {
			[Demographics.Dry]: { value: 0, previous: 0 },
			[Demographics.Lactating]: { value: 1, previous: 0 }
		}
	}
};
```

### Manure
```typescript
export type ManureData = {
	[key in TreatmentSystem]: DemographicData<number>;
};
export type ManureComponent = ComponentDto<ManureData>;
export const manure: ManureComponent = {
	id: "4e97eca0-e8b3-403e-b915-1b15c7f00320",
	name: "Manure Management",
	created: "",
	updated: "",
	status: ComponentComplianceStatus.Confirmed,
	data: {
		[TreatmentSystem.DryLot]: {
			[Demographics.Dry]: { value: 1, previous: 1 }
		}
	}
};
```

### Milk
```typescript
export type MilkData = {
	proteinPercent: DemographicData<number>;
	productionPerDayKg: DemographicData<number>;
};
export type MilkComponent = ComponentDto<MilkData>;
export const milk: MilkComponent = {
	id: "4e97eca0-e8b3-403e-b915-1b15c7f00320",
	name: "Milk Data",
	created: "",
	updated: "",
	status: ComponentComplianceStatus.Confirmed,
	data: {
		proteinPercent: {
			[Demographics.Lactating]: { value: 11, previous: 11 }
		},
		productionPerDayKg: {
			[Demographics.Lactating]: { value: 32.7, previous: 32.7 }
		}
	}
};
```

### Operations
```typescript
export type OperationsData = {
	averageTemperatureC: DataValue<number>;
	electricityMwh: DataValue<number>;
};
export type OperationsComponent = ComponentDto<OperationsData>;
export const operations: OperationsComponent = {
	id: "2ba7f206-70eb-41bb-b7b2-4655df522f90",
	name: "Operations",
	created: "",
	updated: "",
	status: ComponentComplianceStatus.Confirmed,
	data: {
		averageTemperatureC: { value: 22.72, previous: 22.72 },
		electricityMwh: { value: 2.8, previous: 2.8 }
	}
};
```

### Monitoring Period
```json
{
	id: "c3e58f9b-a805-4cda-acd6-1dd6eb6a4911",
	monitoringStart: "2025-01-01",
	monitoringStop: "2025-01-31",
	// ...and all the other monitoring period properties
	components: []
}
```