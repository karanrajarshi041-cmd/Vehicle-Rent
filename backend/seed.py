"""Idempotently install a small, internally consistent demo dataset."""
import os
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash
from sqlalchemy import select
from .db import create_database, default_database_url, local_now
from .models import Base, User, Customer, VehicleCategory, Branch, Vehicle, Booking, Payment, Review, Maintenance, Notification, VehicleReturn


def amounts(rate, days):
    q = lambda x: x.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    rental = Decimal(rate) * days
    service = q(rental * Decimal('0.05'))
    tax = q((rental + service) * Decimal('0.05'))
    return rental, service, tax, rental + service + tax


# Extra illustrative vehicles. Registration is the stable key so an opt-in
# update of an existing demo database never overwrites an edited vehicle.
ADDITIONAL_FLEET = [
    dict(category='muv', branch='Park Street', city='Kolkata', brand='Toyota', model='Innova Crysta',
         registration='WB-01-AB-1211', year=2024, fuel_type='Diesel', transmission='Manual', seats=7,
         daily_rate='3499', image='car-mpv',
         description='Room for the whole crew and their bags, with plenty of space for a longer getaway.'),
    dict(category='suv', branch='Salt Lake', city='Kolkata', brand='Mahindra', model='Thar LX',
         registration='WB-02-CD-1212', year=2024, fuel_type='Diesel', transmission='Manual', seats=4,
         daily_rate='3299', image='car-offroad',
         description='A bold, compact SUV for scenic highways and adventures beyond the city.'),
    dict(category='hatchback', branch='Indiranagar', city='Bengaluru', brand='Maruti Suzuki', model='Swift ZXi',
         registration='KA-03-EF-1213', year=2024, fuel_type='Petrol', transmission='Manual', seats=5,
         daily_rate='1599', image='car-hatchback',
         description='A nimble, easy-going hatchback for city days and weekend plans.'),
    dict(category='bike', branch='Salt Lake', city='Kolkata', brand='Royal Enfield', model='Himalayan 450',
         registration='WB-02-CD-1214', year=2024, fuel_type='Petrol', transmission='Manual', seats=2,
         daily_rate='1499', image='bike-adventure',
         description='An adventure touring motorcycle ready for open roads and mountain views.'),
    dict(category='bike', branch='Park Street', city='Kolkata', brand='KTM', model='390 Duke',
         registration='WB-01-AB-1215', year=2024, fuel_type='Petrol', transmission='Manual', seats=2,
         daily_rate='1399', image='bike-street',
         description='A lively street bike for riders who like a little more energy in their journey.'),
    dict(category='bike', branch='Park Street', city='Kolkata', brand='Bajaj', model='Pulsar N250',
         registration='WB-01-AB-1216', year=2023, fuel_type='Petrol', transmission='Manual', seats=2,
         daily_rate='799', image='bike-street',
         description='A versatile street motorcycle for everyday rides and easy escapes.'),
    dict(category='bike', branch='Connaught Place', city='New Delhi', brand='Hero', model='Xpulse 200 4V',
         registration='DL-01-GH-1217', year=2024, fuel_type='Petrol', transmission='Manual', seats=2,
         daily_rate='1099', image='bike-adventure',
         description='A light adventure bike for exploring new roads at your own pace.'),
]


def add_sample_vehicles(db):
    """Add missing demo vehicles without resetting data or changing existing records.

    The caller controls the transaction. Soft-deleted registrations are also
    left alone so removing a demo vehicle does not bring it back on re-run.
    """
    categories = {c.slug: c for c in db.scalars(select(VehicleCategory))}
    branches = {(b.name, b.city): b for b in db.scalars(select(Branch))}
    required_branches = {(v['branch'], v['city']) for v in ADDITIONAL_FLEET}
    required_categories = {v['category'] for v in ADDITIONAL_FLEET} - {'muv'}
    if not required_branches.issubset(branches) or not required_categories.issubset(categories):
        raise ValueError('The demo branches and categories are missing. Seed an empty demo database first.')
    if 'muv' not in categories:
        if db.scalar(select(VehicleCategory.id).where(VehicleCategory.name == 'MUV')):
            raise ValueError('An existing MUV category has a different slug; resolve it before adding sample vehicles.')
        categories['muv'] = VehicleCategory(name='MUV', slug='muv')
        db.add(categories['muv'])
        db.flush()
    # MySQL commonly uses a case-insensitive unique collation for registration.
    existing = {registration.casefold() for registration in db.scalars(select(Vehicle.registration))}
    count = 0
    for item in ADDITIONAL_FLEET:
        if item['registration'].casefold() in existing:
            continue
        db.add(Vehicle(
            category_id=categories[item['category']].id,
            branch_id=branches[(item['branch'], item['city'])].id,
            brand=item['brand'], model=item['model'], registration=item['registration'],
            year=item['year'], fuel_type=item['fuel_type'], transmission=item['transmission'],
            seats=item['seats'], daily_rate=Decimal(item['daily_rate']),
            driver_available=item['category'] != 'bike',
            driver_daily_rate=Decimal('800') if item['category'] != 'bike' else Decimal('0'),
            image_url='/images/' + item['image'] + '.jpg', description=item['description'],
            featured=True, status='Available', created_at=local_now(),
        ))
        count += 1
    db.flush()
    return count


def seed_data(db):
    if db.scalar(select(User.id).limit(1)):
        return False
    now = local_now()
    at9 = now.replace(hour=9, minute=0, second=0, microsecond=0)
    admin = User(name="Roam Admin", email="admin@roam.test", password_hash=generate_password_hash("Admin123!"), role="admin", created_at=now)
    staff = User(name="Roam Staff", email="staff@roam.test", password_hash=generate_password_hash("Staff123!"), role="staff", created_at=now)
    a = User(name="Aarav Sharma", email="customer@roam.test", password_hash=generate_password_hash("Customer123!"), role="customer", created_at=now - timedelta(days=120))
    b = User(name="Priya Sen", email="priya@roam.test", password_hash=generate_password_hash("Demo12345!"), role="customer", created_at=now - timedelta(days=100))
    c = User(name="Rohan Mehta", email="rohan@roam.test", password_hash=generate_password_hash("Demo12345!"), role="customer", created_at=now - timedelta(days=80))
    d = User(name="Ananya Roy", email="ananya@roam.test", password_hash=generate_password_hash("Demo12345!"), role="customer", created_at=now - timedelta(days=70))
    db.add_all([admin,staff,a,b,c,d]); db.flush()
    # Demo travelers are pre-verified so the existing one-click customer demo
    # remains usable. New registrations always start at Not submitted.
    demo_customers = []
    for index, (user, phone) in enumerate([(a,"+91 98765 43210"),(b,"+91 98765 43211"),(c,"+91 98765 43212"),(d,"+91 98765 43213")]):
        demo_customers.append(Customer(
            user_id=user.id, phone=phone, license_number=f"WB0{index + 1}202400{index + 1:04d}",
            license_expiry=(now + timedelta(days=20 if user is b else 730)).date(),
            kyc_status='Verified', kyc_submitted_at=now-timedelta(days=30), kyc_reviewed_at=now-timedelta(days=29),
            kyc_reviewed_by=admin.id,
        ))
    db.add_all(demo_customers)
    cats = {name: VehicleCategory(name=name, slug=slug) for name,slug in [("SUV","suv"),("Sedan","sedan"),("Hatchback","hatchback"),("Electric","electric"),("Bike","bike"),("Luxury","luxury"),("MUV","muv")]}
    branches = [Branch(name="Park Street", city="Kolkata", address="18 Park Street, Kolkata, West Bengal"), Branch(name="Salt Lake", city="Kolkata", address="Sector V, Salt Lake, Kolkata, West Bengal"), Branch(name="Indiranagar", city="Bengaluru", address="100 Feet Road, Indiranagar, Bengaluru"), Branch(name="Connaught Place", city="New Delhi", address="Connaught Place, New Delhi")]
    db.add_all(list(cats.values()) + branches); db.flush()
    def vehicle(cat, branch, brand, model, reg, year, fuel, transmission, seats, rate, image, featured=False, status="Available", desc=""):
        v = Vehicle(category_id=cats[cat].id, branch_id=branches[branch].id, brand=brand, model=model, registration=reg, year=year, fuel_type=fuel, transmission=transmission, seats=seats, daily_rate=Decimal(rate), driver_available=cat != "Bike", driver_daily_rate=Decimal("1200" if cat == "Luxury" else "800") if cat != "Bike" else Decimal("0"), image_url="/images/"+image+".jpg", featured=featured, status=status, description=desc or "A comfortable, well-maintained drive for city escapes and the open road.", created_at=now)
        db.add(v); db.flush(); return v
    v1=vehicle("SUV",0,"Hyundai","Creta SX","WB-01-AB-1201",2024,"Petrol","Automatic",5,2499,"car-suv",True,desc="Spacious, confident and made for the long way around. The perfect all-rounder for city trips and weekend escapes.")
    v2=vehicle("Sedan",0,"Honda","City ZX","WB-01-AB-1202",2023,"Petrol","Automatic",5,2199,"car-sedan",True,desc="A refined drive with room to stretch out. Enjoy effortless comfort on every journey.")
    v3=vehicle("Electric",1,"Tata","Nexon EV","WB-02-CD-1203",2024,"Electric","Automatic",5,2799,"car-electric",True,desc="Go a little further with a quieter, cleaner drive. Modern comfort meets electric ease.")
    v4=vehicle("Hatchback",0,"Maruti Suzuki","Baleno Alpha","WB-01-AB-1204",2023,"Petrol","Manual",5,1699,"car-hatchback",True,desc="Easy to park and even easier to love. Your nimble companion for exploring the city.")
    v5=vehicle("Luxury",2,"Mercedes-Benz","C-Class","KA-03-EF-1205",2024,"Petrol","Automatic",5,6499,"car-luxury",True,desc="Elevate the everyday with a beautifully refined premium sedan.")
    v6=vehicle("Bike",1,"Royal Enfield","Classic 350","WB-02-CD-1206",2023,"Petrol","Manual",2,899,"bike",True,desc="Two wheels, endless possibilities. A timeless ride for every kind of adventure.")
    v7=vehicle("SUV",2,"Kia","Seltos HTX","KA-03-EF-1207",2023,"Diesel","Automatic",5,2399,"car-suv",False,"Rented")
    v8=vehicle("Sedan",3,"Hyundai","Verna SX","DL-01-GH-1208",2024,"Petrol","Manual",5,1899,"car-sedan")
    v9=vehicle("Luxury",0,"BMW","3 Series","WB-01-AB-1209",2023,"Petrol","Automatic",5,5999,"car-luxury",False,"Under Maintenance")
    v10=vehicle("Electric",3,"MG","ZS EV","DL-01-GH-1210",2024,"Electric","Automatic",5,2999,"car-electric")
    add_sample_vehicles(db)
    def booking(user, v, start, end, status, payment_status="Paid", method="UPI"):
        days=(end-start).days
        rental, service, tax, total=amounts(v.daily_rate,days)
        bk=Booking(user_id=user.id, vehicle_id=v.id, pickup_at=start, return_at=end, pickup_location=branches[[x.id for x in branches].index(v.branch_id)].name+", "+branches[[x.id for x in branches].index(v.branch_id)].city, return_location=branches[[x.id for x in branches].index(v.branch_id)].name+", "+branches[[x.id for x in branches].index(v.branch_id)].city, days=days, daily_rate=v.daily_rate, rental_amount=rental, service_fee=service, tax=tax, total=total, status=status, created_at=min(start-timedelta(days=7),now-timedelta(hours=1)))
        db.add(bk); db.flush()
        db.add(Payment(booking_id=bk.id,amount=total, method=method,status=payment_status, provider="mock",reference=f"DEMO-{bk.id:04d}",paid_at=min(start-timedelta(days=6),now-timedelta(minutes=30)) if payment_status=="Paid" else None,created_at=min(start-timedelta(days=7),now-timedelta(hours=1))))
        if status=="Completed":
            db.add(VehicleReturn(booking_id=bk.id,actual_return_at=end,vehicle_condition="Good",late_fee=0,additional_charges=0,notes="Returned on time."))
        return bk
    past_a=booking(a,v2,at9-timedelta(days=34),at9-timedelta(days=31),"Completed")
    upcoming=booking(a,v1,at9+timedelta(days=8),at9+timedelta(days=11),"Confirmed")
    past_b=booking(b,v1,at9-timedelta(days=65),at9-timedelta(days=61),"Completed","Paid","Card")
    past_c=booking(c,v3,at9-timedelta(days=95),at9-timedelta(days=92),"Completed","Paid","Net banking")
    past_d=booking(d,v4,at9-timedelta(days=20),at9-timedelta(days=18),"Completed")
    active=booking(b,v7,at9-timedelta(days=5),at9-timedelta(days=1),"Active")
    pending=booking(c,v8,at9+timedelta(days=5),at9+timedelta(days=7),"Pending","Pending","Cash")
    db.add_all([
      Review(booking_id=past_a.id,user_id=a.id,vehicle_id=v2.id,rating=5,comment="The whole experience was effortless. The car was spotless and pickup was a breeze.",created_at=at9-timedelta(days=30)),
      Review(booking_id=past_b.id,user_id=b.id,vehicle_id=v1.id,rating=5,comment="A lovely car and the easiest booking process. We had the best weekend away!",created_at=at9-timedelta(days=60)),
      Review(booking_id=past_c.id,user_id=c.id,vehicle_id=v3.id,rating=5,comment="Great service from start to finish. I loved the freedom of exploring at my own pace.",created_at=at9-timedelta(days=91)),
      Review(booking_id=past_d.id,user_id=d.id,vehicle_id=v4.id,rating=4,comment="Super convenient and transparent pricing. Will definitely book again.",created_at=at9-timedelta(days=17)),
      Maintenance(vehicle_id=v9.id,description="Scheduled service and safety inspection",starts_at=at9-timedelta(days=1),ends_at=at9+timedelta(days=2),cost=Decimal('4500'),status="In progress"),
      Notification(user_id=a.id,title="Your trip is confirmed",message=f"Your Hyundai Creta is reserved for {upcoming.pickup_at.strftime('%d %b')}. Happy travels!",created_at=now-timedelta(days=1)),
    ])
    db.commit()
    return True


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='Create or extend the illustrative Roam demo dataset.')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--reset', action='store_true', help='Delete ALL records and recreate the demo dataset')
    group.add_argument('--add-fleet', action='store_true', help='Add missing sample vehicles to an existing demo database')
    args = parser.parse_args()
    load_dotenv()
    url=os.environ.get("DATABASE_URL",default_database_url())
    engine, Session=create_database(url)
    if args.reset:
        print("Resetting ALL tables and demo records.")
        Base.metadata.drop_all(engine); Base.metadata.create_all(engine)
    with Session() as db:
        if args.add_fleet:
            try:
                count = add_sample_vehicles(db)
                db.commit()
                print(f"Added {count} sample vehicle(s). Existing records were left unchanged.")
            except ValueError as error:
                db.rollback()
                raise SystemExit(str(error))
        else:
            print("Demo records created." if seed_data(db) else "Database already contains users; seed skipped.")
