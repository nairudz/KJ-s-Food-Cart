USE OnlineStore;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Customers')
CREATE TABLE Customers (
    CustomerID INT IDENTITY(1,1) PRIMARY KEY,
    FullName NVARCHAR(100) NOT NULL,
    PhoneNumber NVARCHAR(20) NOT NULL,
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Orders')
CREATE TABLE Orders (
    OrderID NVARCHAR(20) PRIMARY KEY,
    CustomerID INT FOREIGN KEY REFERENCES Customers(CustomerID),
    EventDate DATE NOT NULL,
    Subtotal DECIMAL(10, 2) NOT NULL,
    BalanceDue DECIMAL(10, 2) NOT NULL,
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OrderItems')
CREATE TABLE OrderItems (
    ItemID INT IDENTITY(1,1) PRIMARY KEY,
    OrderID NVARCHAR(20) FOREIGN KEY REFERENCES Orders(OrderID),
    PackageDescription NVARCHAR(150) NOT NULL,
    SelectedFlavors NVARCHAR(255),
    Price DECIMAL(10, 2) NOT NULL
);
GO

-- NEW order columns (safe to re-run on your existing tables)
IF COL_LENGTH('Orders','EventName')   IS NULL ALTER TABLE Orders ADD EventName NVARCHAR(150) NULL;
IF COL_LENGTH('Orders','EventTime')   IS NULL ALTER TABLE Orders ADD EventTime NVARCHAR(10) NULL;
IF COL_LENGTH('Orders','Instructions')IS NULL ALTER TABLE Orders ADD Instructions NVARCHAR(1000) NULL;
IF COL_LENGTH('Orders','PaymentRef')  IS NULL ALTER TABLE Orders ADD PaymentRef NVARCHAR(60) NULL;
IF COL_LENGTH('Orders','Status')      IS NULL ALTER TABLE Orders ADD Status NVARCHAR(30) NOT NULL CONSTRAINT DF_Orders_Status DEFAULT 'Pending Payment';
GO

-- NEW inventory table. ItemKey = product ('icecream') or flavor ('icecream:Mango')
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Inventory')
CREATE TABLE Inventory (
    ItemKey NVARCHAR(100) PRIMARY KEY,
    Label NVARCHAR(100) NOT NULL,
    ItemType NVARCHAR(10) NOT NULL,          -- 'product' or 'flavor'
    Quantity INT NOT NULL DEFAULT 0,
    IsEnabled BIT NOT NULL DEFAULT 1
);
GO

INSERT INTO Inventory (ItemKey, Label, ItemType, Quantity)
SELECT v.k, v.l, v.t, v.q FROM (VALUES
 ('icecream','Ice Cream','product',10),('cottoncandy','Cotton Candy','product',10),
 ('popcorn','Popcorn','product',10),('taho','Taho','product',10),('fries','Fries','product',10),
 ('icecream:Charcoal','Charcoal','flavor',50),('icecream:Durian','Durian','flavor',50),
 ('icecream:Dragon Fruit','Dragon Fruit','flavor',50),('icecream:Mango','Mango','flavor',50),
 ('icecream:Avocado','Avocado','flavor',50),('icecream:Cookies & Cream','Cookies & Cream','flavor',50),
 ('icecream:Ube','Ube','flavor',50),
 ('popcorn:Classic Butter','Classic Butter','flavor',50),('popcorn:Cheese','Cheese','flavor',50),
 ('popcorn:BBQ','BBQ','flavor',50),('popcorn:Sweet Caramel','Sweet Caramel','flavor',50),
 ('fries:Cheese','Cheese','flavor',50),('fries:BBQ','BBQ','flavor',50),('fries:Sour Cream','Sour Cream','flavor',50)
) v(k,l,t,q)
WHERE NOT EXISTS (SELECT 1 FROM Inventory i WHERE i.ItemKey = v.k);
GO