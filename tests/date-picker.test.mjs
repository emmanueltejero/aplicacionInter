import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey } from '../src/domain.ts';
import { calendarDate, calendarMonth, moveCalendarMonth } from '../src/teamCalendar.ts';
import { changePickerMonth, datePickerLabel, pickerYearPage } from '../src/datePicker.ts';

test('month and year selection keeps a real day, including leap years and century rules', () => {
  assert.equal(changePickerMonth('2026-01-31', 2026, 2), '2026-02-28');
  assert.equal(changePickerMonth('2024-01-31', 2024, 2), '2024-02-29');
  assert.equal(changePickerMonth('2024-02-29', 2025, 2), '2025-02-28');
  assert.equal(changePickerMonth('2024-02-29', 2000, 2), '2000-02-29');
  assert.equal(changePickerMonth('2024-02-29', 1900, 2), '1900-02-28');
  assert.equal(changePickerMonth('2026-12-31', 2027, 4), '2027-04-30');
  for (const [value, year, month] of [['bad',2026,1],['2026-02-30',2026,3],['2026-01-01',0,1],['2026-01-01',10000,1],['2026-01-01',2026,13],['2026-01-01',2026,1.5]]) assert.throws(() => changePickerMonth(value,year,month));
});
test('date labels are day/month/year while stored values retain complete ISO years', () => {
  assert.equal(datePickerLabel('2026-11-09'), '09/11/2026');
  assert.equal(datePickerLabel('invalid'), 'Seleccionar fecha');
  assert.equal(changePickerMonth('2026-01-31', 1, 1), '0001-01-31');
  assert.equal(dateKey(calendarDate('0099-12-31')), '0099-12-31');
  assert.equal(calendarMonth('0001-01-01').flat().filter(Boolean).length, 31);
  assert.equal(moveCalendarMonth('0001-01-01',-1), null);
  assert.equal(moveCalendarMonth('9999-12-31',1), null);
  assert.equal(pickerYearPage(1),1); assert.equal(pickerYearPage(2026),2017); assert.equal(pickerYearPage(9999),9997);
});
test('selecting dates across DST preserves the intended local day', () => {
  const before = process.env.TZ;
  try {
    for (const zone of ['Atlantic/Canary','America/Los_Angeles']) {
      process.env.TZ=zone;
      assert.equal(changePickerMonth('2026-01-29',2026,3),'2026-03-29');
      assert.equal(changePickerMonth('2026-09-25',2026,10),'2026-10-25');
      assert.equal(calendarDate(changePickerMonth('2026-01-29',2026,3)).getHours(),12);
    }
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ=before; }
});
