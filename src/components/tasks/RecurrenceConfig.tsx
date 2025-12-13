import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RecurrenceConfigProps {
  recurrenceType: string;
  value: any;
  onChange: (config: any) => void;
}

export const RecurrenceConfig = ({ recurrenceType, value, onChange }: RecurrenceConfigProps) => {
  if (recurrenceType === "none") return null;

  const updateConfig = (updates: any) => {
    onChange({ ...value, ...updates });
  };

  const renderWeeklyConfig = () => (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <Label>Repeat on</Label>
      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => {
          const days = value?.days || [];
          const dayNumber = index;
          return (
            <div key={day} className="flex flex-col items-center gap-2">
              <Label htmlFor={`day-${day}`} className="text-xs">
                {day}
              </Label>
              <Checkbox
                id={`day-${day}`}
                checked={days.includes(dayNumber)}
                onCheckedChange={(checked) => {
                  const newDays = checked
                    ? [...days, dayNumber]
                    : days.filter((d: number) => d !== dayNumber);
                  updateConfig({ days: newDays });
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderMonthlyConfig = () => {
    const monthlyType = value?.monthlyType || "date";
    const positionOptions = [
      { value: "1", label: "First" },
      { value: "2", label: "Second" },
      { value: "3", label: "Third" },
      { value: "4", label: "Fourth" },
      { value: "-1", label: "Last" },
      { value: "-2", label: "Second to last" },
    ];
    const dayOptions = [
      { value: "0", label: "Sunday" },
      { value: "1", label: "Monday" },
      { value: "2", label: "Tuesday" },
      { value: "3", label: "Wednesday" },
      { value: "4", label: "Thursday" },
      { value: "5", label: "Friday" },
      { value: "6", label: "Saturday" },
    ];

    return (
      <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
        <RadioGroup
          value={monthlyType}
          onValueChange={(monthlyType) => {
            // Reset relative pattern fields when switching to date mode
            if (monthlyType === "date") {
              updateConfig({ 
                monthlyType,
                bysetpos: undefined,
                byweekday: undefined,
              });
            } else {
              // Set defaults for relative pattern
              updateConfig({ 
                monthlyType,
                bysetpos: value?.bysetpos || [1],
                byweekday: value?.byweekday || [1], // Monday by default
              });
            }
          }}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="date" id="monthly-date" />
            <Label htmlFor="monthly-date" className="flex items-center gap-2">
              On day
              <Input
                type="number"
                min="1"
                max="31"
                className="w-20"
                value={value?.dayOfMonth || 1}
                onChange={(e) => updateConfig({ dayOfMonth: parseInt(e.target.value) || 1 })}
                disabled={monthlyType !== "date"}
              />
              of the month
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="weekday" id="monthly-weekday" />
            <Label htmlFor="monthly-weekday" className="flex items-center gap-2">
              On the
              <Select
                value={value?.bysetpos?.[0]?.toString() || "1"}
                onValueChange={(pos) => {
                  updateConfig({ 
                    bysetpos: [parseInt(pos)],
                  });
                }}
                disabled={monthlyType !== "weekday"}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {positionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={value?.byweekday?.[0]?.toString() || "1"}
                onValueChange={(day) => {
                  updateConfig({ 
                    byweekday: [parseInt(day)],
                  });
                }}
                disabled={monthlyType !== "weekday"}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dayOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              of the month
            </Label>
          </div>
        </RadioGroup>
      </div>
    );
  };

  const renderIntervalConfig = () => (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <div className="flex items-center gap-2">
        <Label>Repeat every</Label>
        <Input
          type="number"
          min="1"
          className="w-20"
          value={value?.interval || 1}
          onChange={(e) => updateConfig({ interval: parseInt(e.target.value) })}
        />
        <span className="text-sm text-muted-foreground">
          {recurrenceType === "daily" ? "day(s)" : 
           recurrenceType === "weekly" ? "week(s)" :
           recurrenceType === "monthly" ? "month(s)" :
           recurrenceType === "yearly" ? "year(s)" : ""}
        </span>
      </div>
    </div>
  );

  const renderEndConfig = () => (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <Label>Ends</Label>
      <RadioGroup
        value={value?.endType || "never"}
        onValueChange={(endType) => updateConfig({ endType })}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="never" id="end-never" />
          <Label htmlFor="end-never">Never</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="on" id="end-on" />
          <Label htmlFor="end-on" className="flex items-center gap-2">
            On
            <Input
              type="date"
              className="w-40"
              value={value?.endDate || ""}
              onChange={(e) => updateConfig({ endDate: e.target.value })}
            />
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="after" id="end-after" />
          <Label htmlFor="end-after" className="flex items-center gap-2">
            After
            <Input
              type="number"
              min="1"
              className="w-20"
              value={value?.occurrences || 1}
              onChange={(e) => updateConfig({ occurrences: parseInt(e.target.value) })}
            />
            occurrences
          </Label>
        </div>
      </RadioGroup>
    </div>
  );

  return (
    <div className="space-y-4">
      {(recurrenceType === "daily" || recurrenceType === "custom") && renderIntervalConfig()}
      {recurrenceType === "weekly" && (
        <>
          {renderIntervalConfig()}
          {renderWeeklyConfig()}
        </>
      )}
      {recurrenceType === "monthly" && (
        <>
          {renderIntervalConfig()}
          {renderMonthlyConfig()}
        </>
      )}
      {recurrenceType === "yearly" && renderIntervalConfig()}
      {recurrenceType !== "none" && renderEndConfig()}
    </div>
  );
};
