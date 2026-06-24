async function run() {
  const host = 'ep-dawn-forest-aidva6wp-pooler.c-4.us-east-1.aws.neon.tech';
  const url = `https://${host}/sql`;
  const connectionString = 'postgresql://neondb_owner:npg_raOEb8sH5pfZ@ep-dawn-forest-aidva6wp-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';
  
  async function query(sql) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connectionString
      },
      body: JSON.stringify({ query: sql, params: [] })
    });
    return await res.json();
  }

  try {
    console.log('Creating table...');
    await query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        dob DATE,
        country VARCHAR(100),
        phone VARCHAR(100),
        amount DECIMAL
      )
    `);
    
    // Check if table has data
    const check = await query('SELECT COUNT(*) FROM employees');
    console.log('Current count:', check.rows[0]);
    
    if (parseInt(check.rows[0].count) === 0) {
      console.log('Inserting sample data...');
      await query(`
        INSERT INTO employees (name, dob, country, phone, amount) VALUES
        ('Alice', '1990-05-12', 'India', '+91-9876543210', 1200.00),
        ('Bob', '1985-11-23', 'USA', '+1-2025551234', 3400.00),
        ('Carol', '1992-07-04', 'Germany', '+91-8012345678', 2100.00),
        ('David', '1978-03-15', 'India', '+91-7712345678', 560.00),
        ('Emma', '1995-09-22', 'UK', '+44-7912345678', 4200.00)
      `);
      console.log('Sample data inserted.');
    }
    
    const select = await query('SELECT * FROM employees');
    console.log('Select Result:', JSON.stringify(select, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
