package dbtx

type Scanner interface{ Scan(...any) error }
