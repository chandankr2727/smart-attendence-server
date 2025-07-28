import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';

// GET /api/attendance - Get attendance records with filtering
export const getAttendanceRecords = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            date,
            status,
            studentId,
            course,
            batch,
            sortBy = 'date',
            sortOrder = 'desc'
        } = req.query;

        // Build filter object
        const filter = {};

        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            filter.date = { $gte: startDate, $lte: endDate };
        }

        if (status) filter.status = status;
        if (studentId) filter.student = studentId;

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Execute query with pagination and population
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const attendance = await Attendance.find(filter)
            .populate({
                path: 'student',
                select: 'name email phone studentId course batch trainingCenter',
                match: course ? { course: { $regex: course, $options: 'i' } } : {}
            })
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Filter out records where student doesn't match course filter
        const filteredAttendance = attendance.filter(record => record.student);

        // Get total count
        const total = await Attendance.countDocuments(filter);

        res.json({
            attendance: filteredAttendance,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total,
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching attendance:', error);
        res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
};

// GET /api/attendance/today - Get today's attendance
export const getTodayAttendance = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const attendance = await Attendance.find({
            date: { $gte: today, $lt: tomorrow }
        })
            .populate('student', 'name email phone studentId course batch')
            .sort({ date: -1 })
            .lean();

        const summary = {
            present: attendance.filter(a => a.status === 'present').length,
            late: attendance.filter(a => a.status === 'late').length,
            absent: attendance.filter(a => a.status === 'absent').length,
            pending: attendance.filter(a => a.status === 'pending_verification').length,
            total: attendance.length
        };

        res.json({
            attendance,
            summary,
            date: today.toISOString().split('T')[0]
        });
    } catch (error) {
        console.error('Error fetching today\'s attendance:', error);
        res.status(500).json({ error: 'Failed to fetch today\'s attendance' });
    }
};

// GET /api/attendance/stats - Get attendance statistics
export const getAttendanceStats = async (req, res) => {
    try {
        const { startDate, endDate, course, batch } = req.query;

        const matchFilter = {};

        if (startDate && endDate) {
            matchFilter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const pipeline = [
            { $match: matchFilter },
            {
                $lookup: {
                    from: 'students',
                    localField: 'student',
                    foreignField: '_id',
                    as: 'studentInfo'
                }
            },
            { $unwind: '$studentInfo' }
        ];

        if (course) {
            pipeline.push({
                $match: { 'studentInfo.course': { $regex: course, $options: 'i' } }
            });
        }

        if (batch) {
            pipeline.push({
                $match: { 'studentInfo.batch': { $regex: batch, $options: 'i' } }
            });
        }

        pipeline.push(
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        );

        const statusStats = await Attendance.aggregate(pipeline);

        // Get daily attendance for the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const dailyStats = await Attendance.aggregate([
            {
                $match: {
                    date: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$date' }
                    },
                    present: {
                        $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
                    },
                    late: {
                        $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
                    },
                    absent: {
                        $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
                    },
                    total: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            statusDistribution: statusStats,
            dailyTrend: dailyStats
        });
    } catch (error) {
        console.error('Error fetching attendance stats:', error);
        res.status(500).json({ error: 'Failed to fetch attendance statistics' });
    }
};

// PUT /api/attendance/:id/verify - Manually verify attendance
export const verifyAttendance = async (req, res) => {
    try {
        const { status, notes } = req.body;

        if (!['present', 'late', 'absent'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const attendance = await Attendance.findByIdAndUpdate(
            req.params.id,
            {
                status,
                'verification.isVerified': true,
                'verification.verifiedBy': 'admin',
                'verification.verifiedAt': new Date(),
                'verification.verificationMethod': 'manual_admin',
                'verification.notes': notes || ''
            },
            { new: true }
        ).populate('student', 'name email phone studentId');

        if (!attendance) {
            return res.status(404).json({ error: 'Attendance record not found' });
        }

        res.json({
            message: 'Attendance verified successfully',
            attendance
        });
    } catch (error) {
        console.error('Error verifying attendance:', error);
        res.status(500).json({ error: 'Failed to verify attendance' });
    }
};

// DELETE /api/attendance/:id - Delete attendance record
export const deleteAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.findByIdAndDelete(req.params.id);

        if (!attendance) {
            return res.status(404).json({ error: 'Attendance record not found' });
        }

        res.json({ message: 'Attendance record deleted successfully' });
    } catch (error) {
        console.error('Error deleting attendance:', error);
        res.status(500).json({ error: 'Failed to delete attendance record' });
    }
}; 