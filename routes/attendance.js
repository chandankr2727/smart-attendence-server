import express from 'express';
import {
    getAttendanceRecords,
    getTodayAttendance,
    getAttendanceStats,
    verifyAttendance,
    deleteAttendance
} from '../controllers/attendanceController.js';

const router = express.Router();

// GET /api/attendance - Get attendance records with filtering
router.get('/', getAttendanceRecords);

// GET /api/attendance/today - Get today's attendance
router.get('/today', getTodayAttendance);

// GET /api/attendance/stats - Get attendance statistics
router.get('/stats', getAttendanceStats);

// PUT /api/attendance/:id/verify - Manually verify attendance
router.put('/:id/verify', verifyAttendance);

// DELETE /api/attendance/:id - Delete attendance record
router.delete('/:id', deleteAttendance);

export default router; 