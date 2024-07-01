const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const qr = require('qrcode');
const path = require("path");
const { Complaint, Alldata,Approved, Solved } = require('./db'); 
const app = express();
const PORT = process.env.PORT || 3000;
const favicon = require('serve-favicon');
const session = require('express-session');
// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // Example: serve static files from 'public' folder
app.set('view engine', 'ejs'); // Example: set view engine to ejs for rendering templates

// MongoDB connection URL
const mongoURI = 'mongodb://localhost:27017/cp';

// Connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Event listeners for MongoDB connection status
mongoose.connection.on('connected', () => {
    console.log('Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('Disconnected from MongoDB');
});



// ??????? VERIFIED ??????


function generateRefId() {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const randomDigits = Math.floor(10000000 + Math.random() * 90000000); // Generate 8 random digits
    return `${timestamp}${randomDigits}`;
}


app.post('/submit_complaint', async (req, res) => {
    const { branch, rollNumber, complaintType, complaintMessage } = req.body;

    // Generate refId
    const refId = generateRefId();

    try {
        // Create a new complaint document
        

        console.log("check");

        // Create a new Date object
        const now = new Date();

        // Get the current date components
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // Months are zero-indexed, so we add 1
        const day = now.getDate();

        const formattedDate = `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`;

        const newComplaint = new Complaint({
            branch,
            rollNumber,
            complaintType,
            complaintMessage,
            refId,
            createdDate: formattedDate
        });


        // Save complaint to MongoDB
        const savedComplaint = await newComplaint.save();

        // Insert refId into Alldata collection
        const newData = new Alldata({
            refid: refId,
            status: 'pending',
            message:complaintMessage,
            createdDate:  formattedDate// Optionally set createdTime explicitly
        });
        await newData.save();

        // Generate QR code URL
        const qrCodeUrl = await qr.toDataURL(`http://localhost:${PORT}/c/qr/${refId}`);

        // Render response with QR code URL and refId
        res.render('complaint_ref_id', { qrCodeUrl, refId });

    } catch (error) {
        console.error('Error submitting complaint:', error);
        res.status(500).send('Error submitting complaint');
    }
});



app.use(session({
    secret: 'shgvashggcfgcvcgv',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico'))); 
app.use('/public/images/', express.static('./public/images'));

app.set("views", path.join(__dirname, "/views"));
app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({ extended: true }));






app.get('/', (req, res) => {
    res.render('home');
});

app.get('/st', (req, res) => {
    res.render('select_table');
});

app.get('/st/:branch', (req, res) => {
    const branch = req.params.branch;
    res.render('complaint_form', { branch: branch });
});
app.post('/c/check_complaint_status', async (req, res) => {
    const refId = req.body.refId;

    try {
        const data = await Alldata.findOne({ refid: refId });

        console.log("DATA IS ");
        console.log(data);

        if (data) {
            const status = data.status;
            return res.render('complaint_status', { statusMessage: { status: status, refId: refId } });
        } else {
            return res.render('complaint_status', { statusMessage: { status: 'Invalid Ref ID', refId: refId } });
        }
    } catch (err) {
        console.error('Error finding complaint:', err);
        return res.status(500).send('Internal Server Error');
    }
});



function authenticateAdmin(req, res, next) {
    if (req.session.authenticatedAdmin) {
        next();
    } else {
        res.render('admin-login');
    }
}
app.get('/admin', authenticateAdmin, async (req, res) => {
    try {
        const complaints = await Complaint.find({});

        console.log(complaints);
        res.render('admin', { complaints: complaints });
    } catch (err) {
        console.error('Error fetching complaints from MongoDB:', err);
        res.status(500).send('Internal Server Error');
    }
});





app.post('/admin/login', (req, res) => {
    const password = req.body.password;
    if (password !== '12345') {
        res.status(401).send('Unauthorized');
        return;
    }
    req.session.authenticatedAdmin = true; 
    res.redirect('/admin');
});

// Example route: Display a form to submit a complaint
app.get('/submit_complaint', (req, res) => {
    res.render('complaint_form'); // Example: render a complaint form using an ejs template
});





app.get('/a/:branch/:roll/:ref_id', async (req, res) => {
    const branch = req.params.branch;
    const rollNumber = req.params.roll;
    const refId = req.params.ref_id;

    console.log(refId);

    try {
        // Step 1: Fetch documents from MongoDB complaints collection using ref_id
     
        const complaints = await Complaint.find({ refId: refId});

      

        if (complaints.length === 0) {
            return res.status(404).send('No complaints found for this branch and roll number');
        }

        console.log("FIRST STEP");
        console.log(complaints);
        console.log("SUCESS 1");




                // Step 2: Insert documents into MongoDB approved collection
            const insertDocs = complaints.map(complaint => ({
                branch: complaint.branch,
                rollNumber: complaint.rollNumber,
                complaintMessage: complaint.complaintMessage,
                refId: complaint.refId,
                complaintType: complaint.complaintType
            }));

            console.log(complaints);

            try {
                const insertResult = await Approved.insertMany(insertDocs);
                console.log(`Documents inserted successfully into Approved: ${insertResult}`);
              
                console.log("Inserted into Approved");
            } catch (err) {
                console.error(`Error inserting documents into Approved: ${err}`);
                throw err; // Rethrow error to handle it in the catch block below
            }

        // Step 3: Update status to 'processing' in alldata collection at ref_id
     
        const updateResult = await Alldata.updateOne({ refid: refId }, { $set: { status: 'processing' } });

        if (updateResult.modifiedCount === 0) {
            throw new Error('No document found in alldata collection to update');
        }


        // Step 4: Delete one document from complaints collection
        const deleteResult = await Complaint.deleteOne({ refId: refId });

        if (deleteResult.deletedCount === 0) {
            throw new Error('No document deleted from complaints collection');
        }

                    console.log('Complaints moved successfully');
        res.redirect('/admin');
    } catch (err) {
        console.error('Error processing request:', err);
        res.status(500).send('Internal Server Error');
    } finally {
         console.log("LAST STEP");
    }
});



app.post('/mark_as_solved/:branch/:refId', async (req, res) => {
    
    const branch = req.params.branch;
    const refId = req.params.refId;
    console.log("FIRST STEP");
    console.log(refId);
    // console.log(branch);
    console.log("CHECK !");

    try {
        // Step 1: Fetch documents from MongoDB complaints collection using ref_id
     
        const complaints = await Approved.find({ refId: refId});

      

        if (complaints.length === 0) {
            return res.status(404).send('No complaints found for this branch and roll number');
        }

        console.log("FIRST STEP");
        console.log(complaints);
        console.log("SUCESS 1");




                // Step 2: Insert documents into MongoDB approved collection
                const now = new Date();

                // Get the current date components
                const year = now.getFullYear();
                const month = now.getMonth() + 1; // Months are zero-indexed, so we add 1
                const day = now.getDate();
        
                const formattedDate = `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`;
        
                const newComplaint = new Solved({
            
                    refid:refId,
                    solvedDate: formattedDate
                });

                const savedComplaint = await newComplaint.save();
        

        // Step 3: Update status to 'processing' in alldata collection at ref_id
     
        const updateResult = await Alldata.updateOne({ refid: refId }, { $set: { status: 'solved' , solvedDate: formattedDate } });

        if (updateResult.modifiedCount === 0) {
            throw new Error('No document found in alldata collection to update');
        }


        // Step 4: Delete one document from complaints collection
        const deleteResult = await Approved.deleteOne({ refId: refId });

        if (deleteResult.deletedCount === 0) {
            throw new Error('No document deleted from complaints collection');
        }

                    console.log('Complaints moved successfully');
        res.redirect(`/${branch}`);
    } catch (err) {
        console.error('Error processing request:', err);
        res.status(500).send('Internal Server Error');
    } finally {
         console.log("LAST STEP");
    }
});






// ?????????????????????????????????????????????????????








app.get('/a/all', async (req, res) => {
    try {
        const complaints = await Alldata.find();

        let pendingCount = 0;
        let processingCount = 0;
        let solvedCount = 0;

        complaints.forEach(complaint => {
            switch (complaint.status) {
                case 'pending':
                    pendingCount++;
                    break;
                case 'processing':
                    processingCount++;
                    break;
                case 'solved':
                    solvedCount++;
                    break;
                default:
                    // Handle any other statuses if needed
                    break;
            }
        });

        res.render('alldata', { 
            complaints: complaints, 
            pendingCount: pendingCount,
            processingCount: processingCount,
            solvedCount: solvedCount
        });
    } catch (error) {
        console.error(error);
        // Handle errors appropriately
        res.status(500).send('Internal Server Error');
    }
});







function authenticateBranch(req, res, next) {
    if (req.session.authenticatedHod){
        next();
    } else {
        const branch = req.params.branch;
        res.render('branch-login', { branch });
    }
}

app.post('/:branch/login', (req, res) => {
    const password = req.body.password;
    const branch = req.params.branch;
   
    if (password === '12345') { 
        req.session.authenticatedHod = true; 
   
        res.redirect(`/${branch}`);
    } else {

        res.send("wrong password");
    }
});

app.get('/:branch', authenticateBranch, async (req, res) => {
    const validBranches = ['csm', 'cse', 'ece', 'csd', 'eee', 'mec', 'civil', 'alldata', 'mba', 'mt', 'it'];
    const branch = req.params.branch.toLowerCase(); 
    
    if (!validBranches.includes(branch)) {
        res.status(400).send('Invalid entry');
        return;
    }
    
    try {
        // Query MongoDB collection using async/await
        const complaints = await Approved.find({ branch: branch }).exec();

        // Render response
        res.render('table', { branch: branch, complaints: complaints });
    } catch (err) {
        console.error('Error fetching complaints:', err);
        res.status(500).send('Internal Server Error');
    }
});







app.get('/c/check', (req, res) => {
    const statusMessage = req.query.statusMessage || 'No status message available';
    res.render('complaint_status', { statusMessage: statusMessage });


});

// app.post('/c/check_complaint_status', (req, res) => {
//     const refId = req.body.refId;

//     const selectQuery = `SELECT status FROM alldata WHERE ref_id = ?`;
//     connection.query(selectQuery, [refId], (err, results) => {
//         if (err) {
//             console.error('Error selecting complaint:', err);
//             return res.status(500).send('Internal Server Error');
//         }

//         if (results.length > 0) {
//             const status = results[0].status;
//             return res.render('complaint_status', { statusMessage: { status: status, refId: refId } });
//         } else {
//             return res.render('complaint_status', { statusMessage: { status: 'Invalid Ref ID', refId: refId } });
//         }
//     });
// });





app.get('/c/qr/:refId', (req, res) => {
    const refId = req.params.refId;

    const selectQuery = `SELECT status FROM alldata WHERE ref_id = ?`;
    connection.query(selectQuery, [refId], (err, results) => {
        if (err) {
            console.error('Error selecting complaint:', err);
            return res.status(500).send('Internal Server Error');
        }

        if (results.length > 0) {
            const status = results[0].status;
            return res.render('complaint_status', { statusMessage: { status: status, refId: refId } });
        } else {
            return res.render('complaint_status', { statusMessage: { status: 'Invalid Ref ID', refId: refId } });
        }
    });
});





// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});



app.get('/', (req, res) => {
    res.render('home');
});