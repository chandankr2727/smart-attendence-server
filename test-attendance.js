// Test file to verify attendance logic
import Student from './models/Student.js';
import mongoose from 'mongoose';

// Mock student data
const mockStudent = new Student({
    name: 'Test Student',
    email: 'test@example.com',
    phone: '+1234567890',
    studentId: 'TEST001',
    course: 'Test Course',
    batch: 'Test Batch'
});

// Mock centers data
const mockCenters = [
    {
        _id: '507f1f77bcf86cd799439011',
        name: 'Main Center',
        address: 'Test Address',
        coordinates: {
            latitude: 28.6139,
            longitude: 77.2090
        },
        radius: 2000, // 2km
        isActive: true,
        timeSlots: {
            morning: {
                start: '09:00',
                end: '13:00'
            },
            afternoon: {
                start: '14:00',
                end: '18:00'
            },
            evening: {
                start: '19:00',
                end: '22:00'
            }
        }
    }
];

// Test cases
console.log('Testing Student model methods...\n');

// Test 1: Location within radius
console.log('Test 1: Location within radius');
const closeLocation = { latitude: 28.6150, longitude: 77.2100 }; // ~1.2km away
const result1 = mockStudent.isWithinAnyCenterRadius(
    closeLocation.latitude,
    closeLocation.longitude,
    mockCenters
);
console.log('Result:', result1);
console.log('Expected: isWithin = true, distance < 2000\n');

// Test 2: Location outside radius
console.log('Test 2: Location outside radius');
const farLocation = { latitude: 28.7000, longitude: 77.3000 }; // ~15km away
const result2 = mockStudent.isWithinAnyCenterRadius(
    farLocation.latitude,
    farLocation.longitude,
    mockCenters
);
console.log('Result:', result2);
console.log('Expected: isWithin = false, distance > 2000\n');

// Test 3: Time slot detection - morning
console.log('Test 3: Time slot detection - morning');
const morningTime = new Date('2024-01-15T10:30:00'); // 10:30 AM
const timeSlot1 = mockStudent.getCurrentTimeSlot(mockCenters[0], morningTime);
console.log('Result:', timeSlot1);
console.log('Expected: slot = morning, isWithinHours = true\n');

// Test 4: Time slot detection - outside hours
console.log('Test 4: Time slot detection - outside hours');
const lateTime = new Date('2024-01-15T23:30:00'); // 11:30 PM
const timeSlot2 = mockStudent.getCurrentTimeSlot(mockCenters[0], lateTime);
console.log('Result:', timeSlot2);
console.log('Expected: slot = null, isWithinHours = false\n');

// Test 5: Late attendance check - on time
console.log('Test 5: Late attendance check - on time');
const onTimeDate = new Date('2024-01-15T09:05:00'); // 9:05 AM (5 min after start)
const isLate1 = mockStudent.isAttendanceLate(mockCenters[0], onTimeDate, 15);
console.log('Result:', isLate1);
console.log('Expected: false (within 15 min threshold)\n');

// Test 6: Late attendance check - late
console.log('Test 6: Late attendance check - late');
const lateDate = new Date('2024-01-15T09:20:00'); // 9:20 AM (20 min after start)
const isLate2 = mockStudent.isAttendanceLate(mockCenters[0], lateDate, 15);
console.log('Result:', isLate2);
console.log('Expected: true (beyond 15 min threshold)\n');

console.log('All tests completed!'); 