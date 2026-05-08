CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    precio NUMERIC(10, 2) NOT NULL,
    stock INTEGER NOT NULL
);

INSERT INTO productos (nombre, descripcion, precio, stock) VALUES 
('Paracetamol 500mg', 'Analgésico y antipirético', 1500, 100),
('Ibuprofeno 400mg', 'Antiinflamatorio no esteroideo', 2000, 50);