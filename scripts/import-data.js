// One-time import script — run with: node scripts/import-data.js <FIREBASE_UID>
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD3O1zaa02Gd9ztpEQ05jsaPLZQKQHXtc4",
  authDomain: "signal-54014.firebaseapp.com",
  projectId: "signal-54014",
  storageBucket: "signal-54014.firebasestorage.app",
  messagingSenderId: "1008047994395",
  appId: "1:1008047994395:web:6c2115cd01cd57c1632abe",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const USER_ID = process.argv[2];
const USER_EMAIL = process.argv[3] || "imaad@signal.app";

if (!USER_ID) {
  console.error("Usage: node scripts/import-data.js <FIREBASE_UID> [email]");
  process.exit(1);
}

const tasks = [
  { title: "Complete Syllabus Acknowledgement Quiz", due_date: "2026-01-12", category: "busi" },
  { title: "Unit 1 - Opens", due_date: "2026-01-12", category: "acct" },
  { title: "Syllabus Acknowledgement Quiz - must make 100% to unlock course materials", due_date: "2026-01-12", category: "acct" },
  { title: "Getting Started - Open", due_date: "2026-01-12", category: "acct" },
  { title: "AI Use Acknowledgement Quiz", due_date: "2026-01-14", category: "acct" },
  { title: "Sample Responds Exam", due_date: "2026-01-14", category: "busi" },
  { title: "Student Introduction Discussion", due_date: "2026-01-14", category: "acct" },
  { title: "Exam 1 opens", due_date: "2026-01-15", category: "acct" },
  { title: "Connect Orientation", due_date: "2026-01-16", category: "acct" },
  { title: "Responds Lockdown Practice Quiz", due_date: "2026-01-17", category: "acct" },
  { title: "Connect Excel Basics - graded", due_date: "2026-01-18", category: "acct" },
  { title: "Ch 1 Accounting in Business", due_date: "2026-01-18", category: "acct" },
  { title: "Connect Orientation Videos - graded", due_date: "2026-01-18", category: "acct" },
  { title: "Introduction Discussion post", due_date: "2026-01-21", category: "busi" },
  { title: "Bstat Assignments due", due_date: "2026-01-21", category: "busi" },
  { title: "Chapter 1 Connect tasks", due_date: "2026-01-26", category: "busi" },
  { title: "Ch 2 Accounting for Business Transactions", due_date: "2026-01-26", category: "acct" },
  { title: "Unit 1 Discussion Post", due_date: "2026-01-28", category: "acct" },
  { title: "Chapter 2 Connect tasks", due_date: "2026-01-30", category: "busi" },
  { title: "Chapter 3 Connect tasks", due_date: "2026-02-02", category: "busi" },
  { title: "Introduction Discussion responses", due_date: "2026-02-06", category: "acct" },
  { title: "Unit 2 - Opens", due_date: "2026-02-13", category: "acct" },
  { title: "Unit 2 Discussion post", due_date: "2026-02-13", category: "busi" },
  { title: "Ch 4 Accounting for Merchandising Businesses", due_date: "2026-02-16", category: "acct" },
  { title: "Chapter 4 Connect tasks", due_date: "2026-02-16", category: "busi" },
  { title: "Chapter 5 Connect tasks", due_date: "2026-02-20", category: "busi" },
  { title: "Ch 5 Inventories", due_date: "2026-02-23", category: "acct" },
  { title: "Chapter 6 Connect tasks", due_date: "2026-02-23", category: "busi" },
  { title: "Ch 3 Adjusting Accounts for Financial Statements", due_date: "2026-02-26", category: "acct" },
  { title: "Unit 3 - Opens", due_date: "2026-02-27", category: "acct" },
  { title: "Unit 2 Review Project opens", due_date: "2026-02-27", category: "acct" },
  { title: "Unit 2 Discussion responses", due_date: "2026-02-27", category: "busi" },
  { title: "Unit 2 Discussion Post", due_date: "2026-03-01", category: "acct" },
  { title: "Education Works", due_date: "2026-03-01", category: "fa" },
  { title: "Unit 2 Exam", due_date: "2026-03-02", category: "busi" },
  { title: "Alumni Event #2", due_date: "2026-03-02", category: "fa" },
  { title: "Ch 6 Cash/Internal Controls", due_date: "2026-03-06", category: "acct" },
  { title: "Unit 3 Discussion Post", due_date: "2026-03-06", category: "acct" },
  { title: "Chapter 7 Connect tasks", due_date: "2026-03-06", category: "busi" },
  { title: "Unit 3 Discussion post", due_date: "2026-03-06", category: "busi" },
  { title: "Blood Drive Committee Meeting", due_date: "2026-03-09", category: "fa" },
  { title: "Social #3", due_date: "2026-03-10", category: "fa" },
  { title: "Tammira (CFA) Event", due_date: "2026-03-11", category: "fa" },
  { title: "Markets R&T Workshop", due_date: "2026-03-12", category: "fa" },
  { title: "Office Tour #1", due_date: "2026-03-13", category: "fa" },
  { title: "Chapter 8 Connect tasks", due_date: "2026-03-13", category: "busi" },
  { title: "Museum Revisions", due_date: "2026-03-15", category: "arts" },
  { title: "Spring Break!", due_date: "2026-03-16", category: "fa" },
  { title: "Ch 7 Receivables", due_date: "2026-03-16", category: "acct" },
  { title: "Chapter 9 Connect tasks", due_date: "2026-03-23", category: "busi" },
  { title: "Alumni Event #3", due_date: "2026-03-23", category: "fa" },
  { title: "Ch 8 Long-term Assets", due_date: "2026-03-23", category: "acct" },
  { title: "Business Club", due_date: "2026-03-24", category: "busi" },
  { title: "Corporate Development Meeting", due_date: "2026-03-25", category: "fa" },
  { title: "6pm BVA Info Session", due_date: "2026-03-26", category: "fa" },
  { title: "InQuizitive for We the People: Chapter 14. The Bureaucracy", due_date: "2026-03-27", category: "govt" },
  { title: "Unit 3 Discussion responses", due_date: "2026-03-27", category: "busi" },
  { title: "Chapter 10 Connect tasks", due_date: "2026-03-27", category: "acct" },
  { title: "Stock Pitch Competition", due_date: "2026-03-27", category: "fa" },
  { title: "InQuizitive for We the People: Chapter 13. The Presidency", due_date: "2026-03-27", category: "govt" },
  { title: "InQuizitive for Governing Texas: Chapter 9: The Executive Branch", due_date: "2026-03-27", category: "govt" },
  { title: "InQuizitive for Governing Texas: Chapter 8: The Legislature", due_date: "2026-03-27", category: "govt" },
  { title: "InQuizitive for We the People: Chapter 15. The Federal Courts", due_date: "2026-03-27", category: "govt" },
  { title: "Community Service Event", due_date: "2026-03-28", category: "fa" },
  { title: "Unit 3 Review Project opens", due_date: "2026-03-29", category: "acct" },
  { title: "Essay 2", due_date: "2026-03-29", category: "arts" },
  { title: "Life Khushyali Majlis @10:30am", due_date: "2026-03-29", category: "home" },
  { title: "Unit 4 - Opens", due_date: "2026-03-30", category: "acct" },
  { title: "Ch 9 Current Liabilities", due_date: "2026-03-30", category: "acct" },
  { title: "Education Works", due_date: "2026-03-30", category: "fa" },
  { title: "U3 Exam availible", due_date: "2026-03-30", category: "busi" },
  { title: "Exam 2 6pm", due_date: "2026-03-31", category: "govt" },
  { title: "CB Competition", due_date: "2026-04-01", category: "fa" },
  { title: "May Mini Registration Opens", due_date: "2026-04-01", category: "school" },
  { title: "Summer 1 Registration Opens", due_date: "2026-04-01", category: "school" },
  { title: "Summer 2 Registration Opens", due_date: "2026-04-01", category: "school" },
  { title: "Summer 11 Week Registration Opens", due_date: "2026-04-01", category: "school" },
  { title: "CB Competition", due_date: "2026-04-02", category: "fa" },
  { title: "Fly to Atlanta", due_date: "2026-04-03", category: "home" },
  { title: "Office Tour", due_date: "2026-04-03", category: "fa" },
  { title: "Ch 11 Corporate Reporting", due_date: "2026-04-06", category: "acct" },
  { title: "Unit 3 Exam", due_date: "2026-04-08", category: "busi" },
  { title: "Fly to Houston", due_date: "2026-04-08", category: "home" },
  { title: "Unit 4 Discussion post", due_date: "2026-04-10", category: "busi" },
  { title: "Chapter 12 Connect tasks", due_date: "2026-04-10", category: "busi" },
  { title: "Chapter 9 quiz", due_date: "2026-04-11", category: "acct" },
  { title: "Chapter 9 Excel", due_date: "2026-04-11", category: "acct" },
  { title: "Chapter 9 HW", due_date: "2026-04-11", category: "acct" },
  { title: "Chapter 13 Connect tasks", due_date: "2026-04-13", category: "busi" },
  { title: "Unit 4 Discussion Post", due_date: "2026-04-13", category: "acct" },
  { title: "Ch 12 Reporting Cash Flows", due_date: "2026-04-13", category: "acct" },
  { title: "Chandrat (dua 7:00pm)", due_date: "2026-04-17", category: "arts" },
  { title: "Chapter 14 Connect tasks", due_date: "2026-04-17", category: "busi" },
  { title: "Chapter 15 Connect tasks", due_date: "2026-04-20", category: "busi" },
  { title: "Last day to drop UH", due_date: "2026-04-22", category: "school" },
  { title: "Unit 4 Discussion responses", due_date: "2026-04-24", category: "busi" },
  { title: "Unit 4 Review Project opens", due_date: "2026-04-24", category: "acct" },
  { title: "Pay day", due_date: "2026-04-24", category: "arts" },
  { title: "Unit 4 Exam", due_date: "2026-04-27", category: "busi" },
  { title: "Comprehensive Final Exam", due_date: "2026-05-03", category: "acct" },
  { title: "Final Exam", due_date: "2026-05-05", category: "busi" },
  { title: "May Mini Begins", due_date: "2026-05-11", category: "school" },
  { title: "May Mini Starts", due_date: "2026-05-11", category: "school" },
  { title: "Memorial Day Holiday", due_date: "2026-05-25", category: "school" },
  { title: "May Mini Ends", due_date: "2026-05-27", category: "school" },
  { title: "May Mini Final Exams", due_date: "2026-05-27", category: "school" },
  { title: "May Mini Ends", due_date: "2026-05-28", category: "school" },
  { title: "Summer 11 Week Classes Begin", due_date: "2026-06-01", category: "school" },
  { title: "Summer 1 Classes Begin", due_date: "2026-06-01", category: "school" },
  { title: "Summer 1 Financial Aid Freeze Date", due_date: "2026-06-04", category: "school" },
  { title: "Summer 11 Week Financial Aid Freeze Date", due_date: "2026-06-04", category: "school" },
  { title: "Summer 11 Week Financial Aid Pell Distribution Date", due_date: "2026-06-08", category: "school" },
  { title: "Summer 1 Financial Aid Pell Distribution Date", due_date: "2026-06-08", category: "school" },
  { title: "Summer 1 Final Exams", due_date: "2026-07-01", category: "school" },
  { title: "Last Date to Submit Application for August Graduation", due_date: "2026-07-01", category: "school" },
  { title: "Summer 1 Ends", due_date: "2026-07-02", category: "school" },
  { title: "Independence Day Holiday", due_date: "2026-07-03", category: "school" },
  { title: "Summer Mini Starts", due_date: "2026-07-06", category: "school" },
  { title: "Summer 2 Classes Begin", due_date: "2026-07-06", category: "school" },
  { title: "Summer Mini Ends", due_date: "2026-08-05", category: "school" },
  { title: "Summer 2 Final Exams", due_date: "2026-08-05", category: "school" },
  { title: "Summer 2 Ends", due_date: "2026-08-06", category: "school" },
  { title: "Summer 11 Week Final Exams", due_date: "2026-08-12", category: "school" },
  { title: "Summer 11 Week Ends", due_date: "2026-08-13", category: "school" },
];

async function importAll() {
  console.log(`Importing ${tasks.length} tasks for user ${USER_ID}...`);
  let count = 0;
  for (const task of tasks) {
    await addDoc(collection(db, "tasks"), {
      ...task,
      status: "todo",
      priority: "medium",
      description: "",
      estimated_minutes: null,
      userId: USER_ID,
      created_by: USER_EMAIL,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    });
    count++;
    if (count % 10 === 0) console.log(`  ${count}/${tasks.length}`);
  }
  console.log(`Done! Imported ${count} tasks.`);
  process.exit(0);
}

importAll().catch(err => { console.error(err); process.exit(1); });
